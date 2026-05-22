from flask import Flask, render_template, jsonify, request, session, redirect, url_for
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import wraps
from datetime import timedelta
import requests
import re
import time
import hmac
import hashlib
import json
import os
import uuid
from urllib3.filepost import encode_multipart_formdata

app = Flask(__name__)

# === CẤU HÌNH ĐĂNG NHẬP + SESSION ĐỘC QUYỀN ===
APP_PASSWORD = os.environ.get("APP_PASSWORD", "kkk")
BOT_PASSWORD = "kkk_bot_secure"  # Pass dành riêng cho Bot

# Ổ khóa toàn cục kiểm soát quyền truy cập
global_lock = {
    "session_id": None,
    "role": None,
    "last_active": 0
}
TIMEOUT_ADMIN = 1800  # 30 phút Admin không thao tác -> tự nhả khóa cho Bot

SECRET_KEY_FILE = ".secret_key"
if os.path.exists(SECRET_KEY_FILE):
    with open(SECRET_KEY_FILE, "rb") as f:
        app.secret_key = f.read()
else:
    app.secret_key = os.urandom(32)
    with open(SECRET_KEY_FILE, "wb") as f:
        f.write(app.secret_key)

app.permanent_session_lifetime = timedelta(days=365)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
# app.config["SESSION_COOKIE_SECURE"] = True  # bật khi dùng HTTPS

GAS_URL = "https://script.google.com/macros/s/AKfycbyRLX8M-oGF87ENDsk2iTJTg3NGOkM0TtfdDeMzU01t3n9tZUXddcrnbt-35YSiZh61hA/exec"
CONFIG_FILE = "config.json"
ACCOUNTS_CACHE_FILE = "accounts_cache.json"

# === DECORATOR YÊU CẦU LOGIN ĐỘC QUYỀN ===
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        current_user_session = session.get("session_id")
        now = time.time()

        # Tự động giải phóng khóa nếu Admin đã "treo máy" vượt quá thời gian TIMEOUT
        if global_lock["role"] == "admin" and (now - global_lock["last_active"] > TIMEOUT_ADMIN):
            global_lock["session_id"] = None
            global_lock["role"] = None

        # Kiểm tra xem user có đang nắm khóa không
        if not current_user_session or current_user_session != global_lock["session_id"]:
            session.clear()
            if request.path.startswith("/api/"):
                return jsonify({"status": "error", "message": "Phiên đăng nhập hết hạn hoặc bị chiếm quyền", "code": "AUTH_REQUIRED"}), 401
            return redirect(url_for("login"))
        
        # Cập nhật thời gian hoạt động mới nhất
        global_lock["last_active"] = now
        return f(*args, **kwargs)
    return wrapper

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        pwd = (request.form.get("password") or "").strip()
        now = time.time()

        # Dọn dẹp khóa hết hạn
        if global_lock["role"] == "admin" and (now - global_lock["last_active"] > TIMEOUT_ADMIN):
            global_lock["session_id"] = None
            global_lock["role"] = None

        if pwd == APP_PASSWORD:
            # ADMIN ĐĂNG NHẬP -> Chiếm quyền tuyệt đối
            session.permanent = True
            new_id = str(uuid.uuid4())
            session["session_id"] = new_id
            global_lock["session_id"] = new_id
            global_lock["role"] = "admin"
            global_lock["last_active"] = now
            return redirect(url_for("index"))

        elif pwd == BOT_PASSWORD:
            # BOT ĐĂNG NHẬP -> Phải kiểm tra Admin
            if global_lock["role"] == "admin":
                return "Admin_Online", 403
            
            session.permanent = True
            new_id = str(uuid.uuid4())
            session["session_id"] = new_id
            global_lock["session_id"] = new_id
            global_lock["role"] = "bot"
            global_lock["last_active"] = now
            return redirect(url_for("index"))

        return render_template("login.html", error="Mật khẩu không đúng!")
    
    # KHI TRUY CẬP GET
    current_user_session = session.get("session_id")
    if current_user_session and current_user_session == global_lock["session_id"]:
        return redirect(url_for("index"))
        
    return render_template("login.html", error=None)

@app.route("/logout")
def logout():
    current_user_session = session.get("session_id")
    if current_user_session and current_user_session == global_lock.get("session_id"):
        # Nhả khóa khi đăng xuất
        global_lock["session_id"] = None
        global_lock["role"] = None
    session.clear()
    return redirect(url_for("login"))

if os.path.exists(ACCOUNTS_CACHE_FILE):
    try:
        with open(ACCOUNTS_CACHE_FILE, 'r', encoding='utf-8') as f:
            accounts_cache = json.load(f)
    except: pass
else: accounts_cache = {}

def mask_key(key):
    if not key: return ""
    key = str(key).strip()
    if len(key) <= 10: return "***"
    return f"{key[:5]}...{key[-5:]}"

def get_proxies(proxy_config):
    proxies = None
    if proxy_config and proxy_config.get('ip') and proxy_config.get('port'):
        ip = proxy_config['ip']
        port = proxy_config['port']
        user = proxy_config.get('user', '')
        pwd = proxy_config.get('pass', '')
        if user and pwd:
            proxy_url = f"http://{user}:{pwd}@{ip}:{port}"
        else:
            proxy_url = f"http://{ip}:{port}"
        proxies = {"http": proxy_url, "https": proxy_url}
    return proxies

# --- API BYBIT ---
def bybit_request(endpoint, api_key, api_secret, payload, proxy_config=None):
    url = f"https://api.bybit.com{endpoint}"
    timestamp = str(int(time.time() * 1000))
    recv_window = "5000"
    payload_str = json.dumps(payload, separators=(',', ':'))
    param_str = timestamp + api_key + recv_window + payload_str
    signature = hmac.new(bytes(api_secret, "utf-8"), param_str.encode("utf-8"), hashlib.sha256).hexdigest()
    headers = {
        "X-BAPI-API-KEY": api_key,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": recv_window,
        "Content-Type": "application/json"
    }
    response = requests.post(url, headers=headers, data=payload_str, proxies=get_proxies(proxy_config), timeout=15)
    return response.json()

@app.route('/')
@app.route('/market')
@app.route('/ads')
@app.route('/orders')
@login_required
def index():
    config_data = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f: config_data = json.load(f)
        except: pass
    return render_template('index.html', server_config=config_data)

@app.route('/api/config', methods=['POST'])
@login_required
def handle_config():
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f: json.dump(request.json, f)
    return jsonify({"status": "success"})

@app.route('/api/groups')
@login_required
def get_groups():
    try:
        data = requests.get(f"{GAS_URL}?action=list_sheets").json()
        if data.get("status") == "success":
            valid_sheets = [s['name'] for s in data.get("sheets", []) if re.match(r'^bb\d+$', s['name'])]
            return jsonify({"status": "success", "groups": valid_sheets})
        return jsonify({"status": "error", "message": "Không thể lấy danh sách"})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/accounts/<group_name>')
@login_required
def get_accounts(group_name):
    try:
        accounts = requests.get(f"{GAS_URL}?sheet={group_name}").json().get("data", [])
        accounts_cache[group_name] = accounts
        with open(ACCOUNTS_CACHE_FILE, 'w', encoding='utf-8') as f: json.dump(accounts_cache, f)
        processed = [{"name": acc.get("name", ""), "api3_masked": mask_key(acc.get("api3", "")), "secret3_masked": mask_key(acc.get("secret3", ""))} for acc in accounts if acc.get("name")]
        return jsonify({"status": "success", "accounts": processed})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

def validate_account(req_data):
    g, idx = req_data.get('group'), int(req_data.get('account_index', -1))
    if g not in accounts_cache or idx < 0 or idx >= len(accounts_cache[g]): return None
    return accounts_cache[g][idx]

@app.route('/api/market', methods=['POST'])
@login_required
def api_market():
    acc = validate_account(request.json)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/item/online", acc["api3"].strip(), acc["secret3"].strip(), {"tokenId": "USDT", "currencyId": "KZT", "side": str(request.json.get('side', "1")), "size": "300"}, request.json.get('proxy'))
        if res.get("retCode", res.get("ret_code")) == 0: return jsonify({"status": "success", "data": res.get("result", {}).get("items", [])})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API")})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/post_ad', methods=['POST'])
@login_required
def api_post_ad():
    acc = validate_account(request.json)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/item/create", acc["api3"].strip(), acc["secret3"].strip(), request.json.get('payload', {}), request.json.get('proxy'))
        if res.get("retCode", res.get("ret_code")) == 0: return jsonify({"status": "success", "data": res.get("result", {})})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API"), "raw": res})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/post_ads_batch', methods=['POST'])
@login_required
def api_post_ads_batch():
    """
    Đăng nhiều quảng cáo SONG SONG (đa luồng) trong 1 request.
    """
    acc = validate_account(request.json)
    if not acc:
        return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})

    items = request.json.get('items', [])
    proxy = request.json.get('proxy')
    api_key = acc["api3"].strip()
    api_secret = acc["secret3"].strip()

    if not items:
        return jsonify({"status": "error", "message": "Không có item nào để đăng."})

    def _post_one(item):
        tag = item.get('tag', '?')
        payload = item.get('payload', {})
        try:
            res = bybit_request("/v5/p2p/item/create", api_key, api_secret, payload, proxy)
            ret_code = res.get("retCode", res.get("ret_code"))
            if ret_code == 0:
                result = res.get("result", {}) or {}
                return {"tag": tag, "ok": True, "itemId": result.get("itemId"), "message": "OK", "raw": result}
            else:
                return {"tag": tag, "ok": False, "itemId": None, "message": res.get("retMsg", "Lỗi Bybit API"), "raw": res}
        except Exception as e:
            return {"tag": tag, "ok": False, "itemId": None, "message": str(e), "raw": None}

    results = []
    with ThreadPoolExecutor(max_workers=min(len(items), 5)) as executor:
        futures = [executor.submit(_post_one, it) for it in items]
        for fu in as_completed(futures):
            results.append(fu.result())

    tag_order = {it.get('tag', '?'): i for i, it in enumerate(items)}
    results.sort(key=lambda r: tag_order.get(r['tag'], 999))

    return jsonify({"status": "success", "results": results})

@app.route('/api/payments', methods=['POST'])
@login_required
def api_payments():
    acc = validate_account(request.json)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/user/payment/list", acc["api3"].strip(), acc["secret3"].strip(), {}, request.json.get('proxy'))
        if res.get("retCode", res.get("ret_code")) == 0: return jsonify({"status": "success", "data": res.get("result", [])})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API")})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/my_ads', methods=['POST'])
@login_required
def api_my_ads():
    acc = validate_account(request.json)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/item/personal/list", acc["api3"].strip(), acc["secret3"].strip(), request.json.get('payload', {}), request.json.get('proxy'))
        if res.get("retCode", res.get("ret_code")) == 0: return jsonify({"status": "success", "data": res.get("result", {})})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API")})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/cancel_ad', methods=['POST'])
@login_required
def api_cancel_ad():
    acc = validate_account(request.json)
    item_id = request.json.get('itemId', '')
    if not acc or not item_id: return jsonify({"status": "error", "message": "Tham số không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/item/cancel", acc["api3"].strip(), acc["secret3"].strip(), {"itemId": item_id}, request.json.get('proxy'))
        if res.get("retCode", res.get("ret_code")) == 0: return jsonify({"status": "success"})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API")})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/ad_info', methods=['POST'])
@login_required
def api_ad_info():
    acc = validate_account(request.json)
    item_id = request.json.get('itemId', '')
    if not acc or not item_id: return jsonify({"status": "error", "message": "Tham số không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/item/info", acc["api3"].strip(), acc["secret3"].strip(), {"itemId": item_id}, request.json.get('proxy'))
        if res.get("retCode", res.get("ret_code")) == 0: return jsonify({"status": "success", "data": res.get("result", {})})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API")})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/relist_ad', methods=['POST'])
@login_required
def api_relist_ad():
    acc = validate_account(request.json)
    payload = request.json.get('payload', {})
    if not acc or not payload: return jsonify({"status": "error", "message": "Tham số không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/item/update", acc["api3"].strip(), acc["secret3"].strip(), payload, request.json.get('proxy'))
        if str(res.get("retCode", res.get("ret_code", ""))) == "0":
            return jsonify({"status": "success"})

        error_msg = res.get("retMsg") or res.get("ret_msg") or "Không có message"
        error_code = res.get("retCode") or res.get("ret_code") or "N/A"

        return jsonify({
            "status": "error",
            "message": f"{error_msg} (Code: {error_code})",
            "raw": res
        })
    except Exception as e:
        return jsonify({"status": "error", "message": f"Lỗi hệ thống: {str(e)}"})

@app.route('/api/pending_orders', methods=['POST'])
@login_required
def api_pending_orders():
    acc = validate_account(request.json)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/order/pending/simplifyList", acc["api3"].strip(), acc["secret3"].strip(), request.json.get('payload', {}), request.json.get('proxy'))
        if str(res.get("retCode", res.get("ret_code", ""))) == "0": return jsonify({"status": "success", "data": res.get("result", {})})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API")})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/all_orders', methods=['POST'])
@login_required
def api_all_orders():
    acc = validate_account(request.json)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/order/simplifyList", acc["api3"].strip(), acc["secret3"].strip(), request.json.get('payload', {}), request.json.get('proxy'))
        if str(res.get("retCode", res.get("ret_code", ""))) == "0": return jsonify({"status": "success", "data": res.get("result", {})})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API")})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/order_info', methods=['POST'])
@login_required
def api_order_info():
    acc = validate_account(request.json)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/order/info", acc["api3"].strip(), acc["secret3"].strip(), request.json.get('payload', {}), request.json.get('proxy'))
        if str(res.get("retCode", res.get("ret_code", ""))) == "0":
            return jsonify({"status": "success", "data": res.get("result", {})})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API")})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/counterparty_info', methods=['POST'])
@login_required
def api_counterparty_info():
    acc = validate_account(request.json)
    if not acc:
        return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        payload = request.json.get('payload', {})
        if not payload.get('originalUid') or not payload.get('orderId'):
            return jsonify({"status": "error", "message": "Thiếu originalUid hoặc orderId."})

        res = bybit_request("/v5/p2p/user/order/personal/info", acc["api3"].strip(), acc["secret3"].strip(), payload, request.json.get('proxy'))

        if str(res.get("retCode", res.get("ret_code", ""))) == "0":
            return jsonify({"status": "success", "data": res.get("result", {})})

        error_msg = res.get("retMsg") or res.get("ret_msg") or "Lỗi Bybit API"
        return jsonify({"status": "error", "message": error_msg})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/chat_messages', methods=['POST'])
@login_required
def api_chat_messages():
    acc = validate_account(request.json)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        res = bybit_request("/v5/p2p/order/message/listpage", acc["api3"].strip(), acc["secret3"].strip(), request.json.get('payload', {}), request.json.get('proxy'))
        if str(res.get("retCode", res.get("ret_code", ""))) == "0":
            return jsonify({"status": "success", "data": res.get("result", {}).get("result", [])})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API")})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/send_chat_message', methods=['POST'])
@login_required
def api_send_chat_message():
    acc = validate_account(request.json)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        payload = request.json.get('payload', {})
        if "msgUuid" not in payload:
            payload["msgUuid"] = uuid.uuid4().hex

        res = bybit_request("/v5/p2p/order/message/send", acc["api3"].strip(), acc["secret3"].strip(), payload, request.json.get('proxy'))
        if str(res.get("retCode", res.get("ret_code", ""))) == "0":
            return jsonify({"status": "success"})
        return jsonify({"status": "error", "message": res.get("retMsg", "Lỗi Bybit API")})
    except Exception as e: return jsonify({"status": "error", "message": str(e)})

@app.route('/api/upload_chat_file', methods=['POST'])
@login_required
def api_upload_chat_file():
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "Không tìm thấy file"})

    acc = validate_account(request.form)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})

    try:
        api_key = acc["api3"].strip()
        api_secret = acc["secret3"].strip()
        timestamp = str(int(time.time() * 1000))
        recv_window = "5000"

        file = request.files['file']
        file_bytes = file.read()

        fields = {
            'upload_file': (file.filename, file_bytes, file.mimetype)
        }
        body, content_type = encode_multipart_formdata(fields)

        param_str_bytes = timestamp.encode('utf-8') + api_key.encode('utf-8') + recv_window.encode('utf-8') + body
        signature = hmac.new(api_secret.encode('utf-8'), param_str_bytes, hashlib.sha256).hexdigest()

        headers = {
            'X-BAPI-API-KEY': api_key,
            'X-BAPI-SIGN': signature,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-RECV-WINDOW': recv_window,
            'Content-Type': content_type
        }

        proxy_ip = request.form.get('proxy_ip')
        proxy_port = request.form.get('proxy_port')
        proxy_user = request.form.get('proxy_user')
        proxy_pass = request.form.get('proxy_pass')

        proxies = None
        if proxy_ip and proxy_port:
            proxy_url = f"http://{proxy_user}:{proxy_pass}@{proxy_ip}:{proxy_port}" if proxy_user else f"http://{proxy_ip}:{proxy_port}"
            proxies = {"http": proxy_url, "https": proxy_url}

        res = requests.post("https://api.bybit.com/v5/p2p/oss/upload_file", headers=headers, data=body, proxies=proxies, timeout=30)
        data = res.json()

        if str(data.get("retCode", data.get("ret_code", ""))) == "0":
            return jsonify({"status": "success", "data": data.get("result", {})})

        err_msg = data.get("retMsg", "Lỗi Bybit API")
        return jsonify({"status": "error", "message": err_msg, "raw": data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/usdt_balance', methods=['POST'])
@login_required
def api_usdt_balance():
    acc = validate_account(request.json)
    if not acc: return jsonify({"status": "error", "message": "Tài khoản không hợp lệ."})
    try:
        api_key = acc["api3"].strip()
        api_secret = acc["secret3"].strip()

        proxy_ip = request.json.get('proxy', {}).get('ip')
        proxy_port = request.json.get('proxy', {}).get('port')
        proxy_user = request.json.get('proxy', {}).get('user')
        proxy_pass = request.json.get('proxy', {}).get('pass')

        proxies = None
        if proxy_ip and proxy_port:
            proxy_url = f"http://{proxy_user}:{proxy_pass}@{proxy_ip}:{proxy_port}" if proxy_user else f"http://{proxy_ip}:{proxy_port}"
            proxies = {"http": proxy_url, "https": proxy_url}

        results = {}
        for acc_type in ["FUND", "UNIFIED", "EARN"]:
            timestamp = str(int(time.time() * 1000))
            recv_window = "5000"
            param_str = f"accountType={acc_type}&coin=USDT"
            sign_str = timestamp + api_key + recv_window + param_str
            signature = hmac.new(bytes(api_secret, "utf-8"), sign_str.encode("utf-8"), hashlib.sha256).hexdigest()

            headers = {
                'X-BAPI-API-KEY': api_key,
                'X-BAPI-SIGN': signature,
                'X-BAPI-TIMESTAMP': timestamp,
                'X-BAPI-RECV-WINDOW': recv_window
            }

            res = requests.get(f"https://api.bybit.com/v5/asset/transfer/query-account-coins-balance?{param_str}", headers=headers, proxies=proxies, timeout=15)
            data = res.json()
            results[acc_type] = data

        return jsonify({"status": "success", "data": results})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/translate', methods=['POST'])
@login_required
def api_translate():
    try:
        text = request.json.get('text', '')
        target_lang = request.json.get('target_lang', 'vi')

        config_data = {}
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config_data = json.load(f)

        openai_key = config_data.get('openai_key', '').strip()
        if not openai_key:
            return jsonify({"status": "error", "message": "Chưa cấu hình OpenAI API Key"})

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {openai_key}"
        }

        system_prompt = "You are a highly accurate translator. Translate the user's text directly into Vietnamese. Maintain the exact original meaning, intent, and length. Use standard, polite language but DO NOT add unnecessary pleasantries, explanations, or change the core message."

        if target_lang == 'ru':
            system_prompt = "You are a highly accurate translator. Translate the user's text directly into Russian. Maintain the exact original meaning, intent, and length. Use standard, polite language but DO NOT add unnecessary pleasantries, explanations, or change the core message."

        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            "temperature": 0.1
        }

        res = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=15)
        data = res.json()

        if 'choices' in data and len(data['choices']) > 0:
            translated_text = data['choices'][0]['message']['content'].strip()
            return jsonify({"status": "success", "data": translated_text})
        else:
            return jsonify({"status": "error", "message": "Lỗi từ OpenAI: " + str(data)})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/chat_templates', methods=['GET', 'POST', 'DELETE'])
@login_required
def api_chat_templates():
    try:
        TEMPLATES_FILE = 'chat_templates.json'
        templates = [
            "Xin chào, tôi đang online. Bạn gửi tiền nhé!",
            "Tôi đã nhận được tiền, đang nhả coin.",
            "Vui lòng thanh toán nhanh giúp tôi nhé."
        ]

        if os.path.exists(TEMPLATES_FILE):
            with open(TEMPLATES_FILE, 'r', encoding='utf-8') as f:
                templates = json.load(f)

        if request.method == 'GET':
            return jsonify({"status": "success", "data": templates})

        elif request.method == 'POST':
            new_text = request.json.get('text', '').strip()
            if new_text and new_text not in templates:
                templates.append(new_text)
                with open(TEMPLATES_FILE, 'w', encoding='utf-8') as f:
                    json.dump(templates, f, indent=4, ensure_ascii=False)
            return jsonify({"status": "success", "data": templates})

        elif request.method == 'DELETE':
            del_text = request.json.get('text', '').strip()
            if del_text in templates:
                templates.remove(del_text)
                with open(TEMPLATES_FILE, 'w', encoding='utf-8') as f:
                    json.dump(templates, f, indent=4, ensure_ascii=False)
            return jsonify({"status": "success", "data": templates})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


# ================== LOG HOẠT ĐỘNG TỰ ĐỘNG ==================
ACTIVITY_LOG_FILE = "activity_log.jsonl"

@app.route('/api/activity_logs')
@login_required
def api_activity_logs():
    """Đọc log hoạt động (mới nhất trên đầu, tối đa 1000 dòng)."""
    try:
        if not os.path.exists(ACTIVITY_LOG_FILE):
            return jsonify({"status": "success", "data": []})
        with open(ACTIVITY_LOG_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
        data = []
        for line in lines[-1000:]:
            try: data.append(json.loads(line))
            except: pass
        data.reverse()
        return jsonify({"status": "success", "data": data, "total": len(lines)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


@app.route('/logs')
@login_required
def page_logs():
    return """<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<title>📊 Log Hoạt Động Bot</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<style>
body{background:#f1f5f9;font-family:-apple-system,sans-serif;font-size:13px;padding:20px}
.kind-badge{padding:3px 8px;border-radius:5px;font-weight:600;font-size:11px;display:inline-block;text-transform:uppercase}
.k-auto_update_ad{background:#dbeafe;color:#1e40af}
.k-manual_post_ad,.k-manual_post_batch{background:#dcfce7;color:#166534}
.k-cancel_ad{background:#fee2e2;color:#991b1b}
.k-relist_ad{background:#fef3c7;color:#92400e}
.k-mark_paid,.k-release_assets{background:#e0e7ff;color:#3730a3}
.k-heartbeat{background:#f1f5f9;color:#64748b}
.k-login,.k-startup,.k-hook_installed,.k-system{background:#f0fdf4;color:#15803d}
.k-error,.k-js_error{background:#fef2f2;color:#b91c1c}
.k-unknown{background:#e5e7eb;color:#374151}
.st-success{color:#16a34a;font-weight:700}
.st-error{color:#dc2626;font-weight:700}
.tbl{background:#fff;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.06);overflow:hidden}
th{background:#0f172a!important;color:#fff!important;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
td{vertical-align:middle;font-size:13px}
code{background:#f8fafc;padding:2px 5px;border-radius:3px;color:#0f172a}
.detail-cell{max-width:420px;word-break:break-word}
.side-mua{background:#16a34a;color:#fff;padding:1px 6px;border-radius:3px;font-weight:600;font-size:11px}
.side-ban{background:#dc2626;color:#fff;padding:1px 6px;border-radius:3px;font-weight:600;font-size:11px}
</style></head><body>
<div class="container-fluid">
<div class="d-flex justify-content-between align-items-center mb-3">
<h4>📊 Log Hoạt Động Tự Động <small class="text-muted" id="cnt"></small></h4>
<div>
<select id="filterKind" class="form-select form-select-sm d-inline-block" style="width:180px">
<option value="">— Tất cả loại —</option>
<option value="auto_update_ad">Auto sửa giá QC</option>
<option value="manual_post_ad">Đăng QC</option>
<option value="manual_post_batch">Đăng QC hàng loạt</option>
<option value="cancel_ad">Hủy QC</option>
<option value="relist_ad">Đăng lại QC</option>
<option value="mark_paid">Đánh dấu đã trả</option>
<option value="release_assets">Nhả coin</option>
<option value="heartbeat">Heartbeat</option>
<option value="login">Login</option>
<option value="error">Lỗi</option>
</select>
<input id="filterText" type="text" class="form-control form-control-sm d-inline-block" style="width:200px" placeholder="Lọc Ad ID / nội dung...">
<button class="btn btn-sm btn-primary" onclick="load()">🔄 Làm mới</button>
<a href="/" class="btn btn-sm btn-secondary">← Dashboard</a>
</div>
</div>
<div class="tbl">
<table class="table table-sm table-hover mb-0">
<thead><tr><th>#</th><th style="width:140px">Thời gian</th><th style="width:140px">Loại</th><th style="width:80px">Trạng thái</th><th>Chi tiết</th></tr></thead>
<tbody id="body"><tr><td colspan="5" class="text-center p-4">Đang tải...</td></tr></tbody>
</table>
</div>
</div>
<script>
let allData = [];
async function load(){
  try{
    const r = await fetch('/api/activity_logs');
    const d = await r.json();
    allData = d.data || [];
    document.getElementById('cnt').textContent = '('+allData.length+'/'+(d.total||0)+')';
    render();
  }catch(e){ document.getElementById('body').innerHTML = '<tr><td colspan=5 class="text-center text-danger p-3">Lỗi tải log</td></tr>'; }
}
function render(){
  const fk = document.getElementById('filterKind').value;
  const ft = document.getElementById('filterText').value.toLowerCase().trim();
  let data = allData;
  if (fk) data = data.filter(x => x.kind === fk);
  if (ft) data = data.filter(x => JSON.stringify(x.detail||{}).toLowerCase().includes(ft));

  const body = document.getElementById('body');
  if (!data.length){ body.innerHTML = '<tr><td colspan=5 class="text-center text-muted p-4">Không có log phù hợp.</td></tr>'; return; }

  body.innerHTML = data.map((x,i) => {
    const d = x.detail || {};
    const st = d.status || '';
    const stCls = st === 'success' ? 'st-success' : (st === 'error' ? 'st-error' : '');
    const sideHtml = d.side === 'MUA' ? '<span class="side-mua">MUA</span>' : (d.side === 'BÁN' ? '<span class="side-ban">BÁN</span>' : '');

    let detailHtml = '';
    if (d.ad_id) detailHtml += `🆔 <code>${d.ad_id}</code> `;
    if (sideHtml) detailHtml += sideHtml + ' ';
    if (d.price) detailHtml += `💲 <b>${d.price}</b> `;
    if (d.quantity) detailHtml += `📦 ${d.quantity} `;
    if (d.min_amount || d.max_amount) detailHtml += `Range: ${d.min_amount}-${d.max_amount} `;
    if (d.order_id) detailHtml += `Order: <code>${d.order_id}</code> `;
    if (d.message) detailHtml += `<div class="text-muted mt-1" style="font-size:11px"><i>${d.message}</i></div>`;
    if (!detailHtml) detailHtml = '<small class="text-muted">'+JSON.stringify(d)+'</small>';

    return `<tr>
      <td class="text-muted">${i+1}</td>
      <td><small>${x.time||''}</small></td>
      <td><span class="kind-badge k-${x.kind}">${(x.kind||'').replace(/_/g,' ')}</span></td>
      <td class="${stCls}">${st}</td>
      <td class="detail-cell">${detailHtml}</td>
    </tr>`;
  }).join('');
}
document.getElementById('filterKind').addEventListener('change', render);
document.getElementById('filterText').addEventListener('input', render);
load();
setInterval(load, 10000);
</script></body></html>"""
# ============================================================

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5006)