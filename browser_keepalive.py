"""
Browser keepalive + ghi log mọi hành vi tự động hóa (sửa giá, đăng QC, hủy QC, tăng U...)
vào file activity_log.jsonl — lưu vĩnh viễn.
"""

from playwright.sync_api import sync_playwright
from datetime import datetime, timezone, timedelta
import json
import os
import time

URL          = "http://localhost:5006"
PASSWORD     = "kkk_bot_secure"   # ⚠️ ĐỔI cho khớp APP_PASSWORD (mặc định trong app.py là "kkk")
TAB_PATH     = "/orders"
RELOAD_EVERY = 1800
LOG_FILE     = "/root/kzt-bot/activity_log.jsonl"

TZ_VN = timezone(timedelta(hours=7))


def write_log(kind, detail):
    """Ghi 1 dòng JSON vào file log."""
    try:
        entry = {
            "time": datetime.now(TZ_VN).strftime("%Y-%m-%d %H:%M:%S"),
            "kind": kind,         # auto_update_ad / auto_increase_u / kzt_change / order_new / login / heartbeat / error
            "detail": detail,
        }
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"[Log] write err: {e}")


# JS inject để hook fetch() — bắt mọi request auto tới các endpoint quan trọng
HOOK_JS = """
(() => {
    if (window.__hooked) return;
    window.__hooked = true;
    const origFetch = window.fetch;

    // Endpoint cần log
    const watch = {
        '/api/update_ad': 'auto_update_ad',
        '/api/post_ad': 'manual_post_ad',
        '/api/post_ads_batch': 'manual_post_batch',
        '/api/cancel_ad': 'cancel_ad',
        '/api/relist_ad': 'relist_ad',
        '/api/mark_paid': 'mark_paid',
        '/api/release_assets': 'release_assets',
        '/api/pending_orders': 'pending_poll'      // ← thêm dòng này
    };

    window.fetch = async function(url, opts) {
        const u = (typeof url === 'string') ? url : url.url;
        let kind = null;
        for (const k in watch) { if (u.includes(k)) { kind = watch[k]; break; } }

        let bodyData = null;
        if (kind && opts && opts.body) {
            try { bodyData = JSON.parse(opts.body); } catch(e){}
        }

        const resp = await origFetch.apply(this, arguments);

        if (kind) {
            try {
                const clone = resp.clone();
                const data = await clone.json();
                const payload = (bodyData && bodyData.payload) || bodyData || {};
                console.log('__BOT_EVENT__' + JSON.stringify({
                    kind: kind,
                    status: data.status,
                    message: data.message || '',
                    ad_id: payload.id || payload.itemId || '',
                    side: payload.side === '0' || payload.side === 0 ? 'MUA' : (payload.side === '1' || payload.side === 1 ? 'BÁN' : ''),
                    price: payload.price || '',
                    quantity: payload.quantity || '',
                    min_amount: payload.minAmount || '',
                    max_amount: payload.maxAmount || '',
                    order_id: payload.orderId || ''
                }));
            } catch(e) {}
        }

        return resp;
    };
    console.log('__BOT_EVENT__' + JSON.stringify({kind:'hook_installed', status:'success', message:'JS fetch hook đã cài đặt'}));
})();
"""


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        )
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
        )
        page = context.new_page()

        # === Bắt console: nếu có prefix __BOT_EVENT__ thì ghi log ===
        def on_console(msg):
            try:
                txt = msg.text
                if txt.startswith('__BOT_EVENT__'):
                    try:
                        data = json.loads(txt[len('__BOT_EVENT__'):])
                        kind = data.pop('kind', 'unknown')
                        write_log(kind, data)
                        print(f"[LOG] {kind} → {data.get('status','?')} {data.get('ad_id','')} {data.get('message','')}")
                    except Exception as e:
                        print(f"[Log parse err] {e}: {txt[:200]}")
                # Bỏ qua mấy log rác
                elif any(x in txt.lower() for x in ['favicon', 'devtools', 'tailwind']):
                    pass
                else:
                    print(f"[JS:{msg.type}] {txt[:300]}")
            except: pass

        page.on("console", on_console)
        page.on("pageerror", lambda exc: (print(f"[JS ERROR] {exc}"), write_log("js_error", {"error": str(exc)})))

        # Tự inject hook MỖI khi load 1 frame mới (page navigate / reload)
        context.add_init_script(HOOK_JS)

        # === Đăng nhập ===
        try:
            print(f"[Browser] Mở {URL}/login")
            page.goto(f"{URL}/login", timeout=30000)
            page.fill('input[name="password"]', PASSWORD)
            page.click('button[type="submit"]')
            page.wait_for_load_state('networkidle', timeout=30000)

            if "/login" in page.url:
                print(f"[Browser] ❌ ĐĂNG NHẬP THẤT BẠI - sai password!")
                write_log("login", {"status": "error", "message": "Sai mật khẩu"})
                browser.close()
                return

            print(f"[Browser] ✅ Đăng nhập OK, URL: {page.url}")
            write_log("login", {"status": "success", "url": page.url})
        except Exception as e:
            print(f"[Browser] Lỗi login: {e}")
            write_log("login", {"status": "error", "message": str(e)})
            browser.close()
            return

        # === Vào /orders ===
        try:
            page.goto(f"{URL}{TAB_PATH}", timeout=30000)
            page.wait_for_load_state('networkidle', timeout=30000)
            time.sleep(3)

            page.evaluate("""() => {
                if (typeof previouslyNotifiedIds !== 'undefined') previouslyNotifiedIds = new Set();
                if (typeof pendingIds !== 'undefined') pendingIds = new Set(['__FAKE__']);
                console.log('__BOT_EVENT__' + JSON.stringify({kind:'startup', status:'success', message:'Browser keepalive đã sẵn sàng'}));
            }""")
            print(f"[Browser] ✅ Đang ở {page.url}, hook đã inject")
        except Exception as e:
            print(f"[Browser] Lỗi vào /orders: {e}")
            write_log("error", {"message": f"goto /orders: {e}"})

        # === Vòng lặp giữ sống ===
        last_reload = time.time()
        last_heartbeat = time.time()

        while True:
            try:
                time.sleep(30)
                now = time.time()

                # Heartbeat mỗi 5 phút (ghi vào log để biết bot còn sống)
                if now - last_heartbeat >= 300:
                    try:
                        info = page.evaluate("""() => ({
                            url: window.location.pathname,
                            pendingRows: document.getElementById('pendingOrdersBody') ? document.getElementById('pendingOrdersBody').children.length : 0,
                            locked: document.getElementById('configArea') ? document.getElementById('configArea').classList.contains('locked-overlay') : false
                        })""")
                        write_log("heartbeat", info)
                        last_heartbeat = now
                    except Exception as e:
                        print(f"[Browser] hb err: {e}")

                # Reload định kỳ
                if now - last_reload >= RELOAD_EVERY:
                    print("[Browser] Reload định kỳ...")
                    page.reload(timeout=30000)
                    page.wait_for_load_state('networkidle', timeout=30000)
                    time.sleep(3)
                    page.evaluate("""() => {
                        if (typeof previouslyNotifiedIds !== 'undefined') previouslyNotifiedIds = new Set();
                        if (typeof pendingIds !== 'undefined') pendingIds = new Set(['__FAKE__']);
                    }""")
                    last_reload = now

                # Re-login nếu bị kick
                if "/login" in page.url:
                    print("[Browser] Bị logout, login lại...")
                    page.fill('input[name="password"]', PASSWORD)
                    page.click('button[type="submit"]')
                    page.wait_for_load_state('networkidle', timeout=30000)
                    page.goto(f"{URL}{TAB_PATH}", timeout=30000)
                    write_log("login", {"status": "re-login"})

            except Exception as e:
                print(f"[Browser] Loop err: {e}")
                write_log("error", {"message": f"loop: {e}"})
                try:
                    page.goto(f"{URL}{TAB_PATH}", timeout=30000)
                    last_reload = time.time()
                except Exception as e2:
                    print(f"[Browser] Không khôi phục: {e2}")
                    time.sleep(30)


if __name__ == "__main__":
    print("[Browser] STARTED")
    write_log("system", {"message": "browser_keepalive khởi động"})
    while True:
        try:
            run()
        except Exception as e:
            print(f"[Browser] Crash: {e}, restart sau 10s")
            write_log("error", {"message": f"crash: {e}"})
            time.sleep(10)