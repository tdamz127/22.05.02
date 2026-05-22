let orderDetailModal = null;
let chatTemplatesModal = null;
let currentViewingOrder = null;
let chatRefreshInterval = null;
let orderCountdownInterval = null;
window.currentCounterpartyHtml = null; 
window.autoTranslatedCache = window.autoTranslatedCache || {}; 

// Hàm dịch Nga <-> Latin
function transliterateName(text) {
    if (!text) return "";
    const isCyr = /[\u0400-\u04FF]/.test(text);
    const ru2la = {"А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ё":"E","Ж":"ZH","З":"Z","И":"I","Й":"Y","К":"K","Л":"L","М":"M","Н":"N","О":"O","П":"P","Р":"R","С":"S","Т":"T","У":"U","Ф":"F","Х":"KH","Ц":"TS","Ч":"CH","Ш":"SH","Щ":"SHCH","Ъ":"","Ы":"Y","Ь":"","Э":"E","Ю":"YU","Я":"YA","а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"kh","ц":"ts","ч":"ch","ш":"sh","щ":"shch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"};
    const la2ruMulti = {"ZH":"Ж","KH":"Х","TS":"Ц","CH":"Ч","SH":"Ш","SHCH":"Щ","YU":"Ю","YA":"Я","zh":"ж","kh":"х","ts":"ц","ch":"ч","sh":"ш","shch":"щ","yu":"ю","ya":"я"};
    const la2ru = {"A":"А","B":"Б","V":"В","G":"Г","D":"Д","E":"Е","Z":"З","I":"И","Y":"Й","K":"К","L":"Л","M":"М","N":"Н","O":"О","P":"П","R":"Р","S":"С","T":"Т","U":"У","F":"Ф","a":"а","b":"б","v":"в","g":"г","d":"д","e":"е","z":"з","i":"и","y":"й","k":"к","l":"л","m":"м","n":"н","o":"о","p":"п","r":"r","s":"с","t":"т","u":"у","f":"ф"};

    if (isCyr) {
        let res = text.split('').map(char => ru2la[char] || char).join('');
        return `${text} (${res})`;
    } else {
        let res = text;
        for (let key in la2ruMulti) res = res.split(key).join(la2ruMulti[key]);
        res = res.split('').map(char => la2ru[char] || char).join('');
        return `${text} (${res})`;
    }
}

window.showCustomConfirm = function(title, message, btnText, btnClass, callback) {
    let existing = document.getElementById('customConfirmModal');
    if (existing) existing.remove();

    const modalHtml = `
        <div class="modal fade" id="customConfirmModal" tabindex="-1" aria-hidden="true" style="z-index: 1060; background: rgba(0,0,0,0.5);">
            <div class="modal-dialog modal-dialog-centered modal-sm">
                <div class="modal-content border-0 shadow-lg" style="border-radius: 12px;">
                    <div class="modal-header bg-light border-bottom-0" style="border-radius: 12px 12px 0 0; padding: 12px 16px;">
                        <h6 class="modal-title fw-bold text-dark mb-0"><i class="fas fa-question-circle text-primary me-2"></i>${title}</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" style="font-size: 12px;"></button>
                    </div>
                    <div class="modal-body py-4 text-center text-dark" style="font-size: 15px;">
                        ${message}
                    </div>
                    <div class="modal-footer border-top-0 justify-content-center bg-light" style="border-radius: 0 0 12px 12px; padding: 10px;">
                        <button type="button" class="btn btn-secondary fw-bold" data-bs-dismiss="modal">Hủy bỏ</button>
                        <button type="button" class="btn ${btnClass} fw-bold" id="btnCustomConfirmAction">${btnText}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modalEl = document.getElementById('customConfirmModal');
    const bsModal = new bootstrap.Modal(modalEl);
    
    document.getElementById('btnCustomConfirmAction').addEventListener('click', () => {
        bsModal.hide();
        callback();
    });
    
    bsModal.show();
};

window.renderOrderInfo = function(ord, isInitialLoad = false) {
    try {
        let st = window.getOrderStatusConfig(ord.status);
        if(ord.status === 20) st.class = 'text-info';

        let actionButtonsHtml = '';
        if (ord.side === 0 && ord.status === 10) {
            let pType = "", pId = "";
            if (ord.confirmedPayTerm) {
                pType = ord.confirmedPayTerm.paymentType || ""; pId = ord.confirmedPayTerm.paymentId || ord.confirmedPayTerm.id || "";
            } else if (ord.paymentTermList && ord.paymentTermList.length > 0) {
                pType = ord.paymentTermList[0].paymentType || ""; pId = ord.paymentTermList[0].paymentId || ord.paymentTermList[0].id || "";
            }
            actionButtonsHtml = `
                <div class="mb-3 border-bottom pb-3">
                    <button class="btn btn-success fw-bold" id="btnMarkAsPaid" data-order="${ord.id}" data-ptype="${pType}" data-pid="${pId}">
                        <i class="fas fa-check-circle"></i> Đã thanh toán
                    </button>
                </div>
            `;
        } else if (ord.side === 1 && ord.status === 20) {
            actionButtonsHtml = `
                <div class="mb-3 border-bottom pb-3">
                    <button class="btn btn-warning fw-bold text-dark" id="btnReleaseAssets" data-order="${ord.id}">
                        <i class="fas fa-unlock-alt"></i> Mở khóa đơn
                    </button>
                </div>
            `;
        }

        if (isInitialLoad) {
            if (ord.createDate) {
                const createDateObj = new Date(parseInt(ord.createDate));
                const formattedDate = createDateObj.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit', year:'numeric'});
                const formattedTime = createDateObj.toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});
                if(document.getElementById('dtCreateTimeHeader')) document.getElementById('dtCreateTimeHeader').innerText = `Tạo lúc: ${formattedDate} ${formattedTime}`;
            }

            const sideText = ord.side === 0 ? '<span class="text-success fw-bold">MUA (BUY)</span>' : '<span class="text-danger fw-bold">BÁN (SELL)</span>';
            
            let payInfo = 'Không có';
            if (ord.confirmedPayTerm && ord.confirmedPayTerm.paymentConfigVo) {
                payInfo = `${ord.confirmedPayTerm.paymentConfigVo.paymentName}`;
            } else if (ord.paymentTermList && ord.paymentTermList.length > 0 && ord.paymentTermList[0].paymentConfigVo) {
                payInfo = `${ord.paymentTermList[0].paymentConfigVo.paymentName}`;
            }

            let fullPayDetails = 'Không có thông tin chi tiết';
            if (ord.confirmedPayTerm && ord.confirmedPayTerm.accountNo) {
                const ct = ord.confirmedPayTerm;
                fullPayDetails = `${ct.paymentConfigVo?.paymentName || ''} - ${ct.bankName || ''} - ${ct.accountNo} (${ct.realName || ord.sellerRealName || ord.buyerRealName || ''})`;
            }

            const priceStr = parseFloat(ord.price || 0).toLocaleString();
            const qtyStr = parseFloat(ord.quantity || 0).toLocaleString();
            const amountStr = parseFloat(ord.amount || 0).toLocaleString();
            
            const pName = ord.targetNickName || 'User';
            const realName = ord.side === 0 ? ord.sellerRealName : ord.buyerRealName;
            const realNameFormatted = transliterateName(realName);

            if(document.getElementById('orderDetailBody')) {
                document.getElementById('orderDetailBody').innerHTML = `
                    <div id="orderActionButtons">${actionButtonsHtml}</div>
                    
                    <div class="row border-bottom pb-2">
                        <div class="col-4">
                            <div class="text-secondary mb-1" style="font-size: 12px;">Trạng thái</div>
                            <div class="fw-bold ${st ? st.class : 'text-dark'}" style="font-size: 14px;" id="uiOrderStatus">${st ? st.text : 'Unknown'}</div>
                        </div>
                        <div class="col-4">
                            <div class="text-secondary mb-1" style="font-size: 12px;">Loại</div>
                            <div style="font-size: 14px;">${sideText}</div>
                        </div>
                        <div class="col-4">
                            <div class="text-secondary mb-1" style="font-size: 12px;">Giá</div>
                            <div class="fw-bold text-dark" style="font-size: 14px;">${priceStr} ${ord.currencyId}/${ord.tokenId}</div>
                        </div>
                    </div>
                    <div class="row border-bottom py-2">
                        <div class="col-4">
                            <div class="text-secondary mb-1" style="font-size: 12px;">Số lượng Coin</div>
                            <div class="fw-bold text-dark" style="font-size: 14px;">${qtyStr} ${ord.tokenId}</div>
                        </div>
                        <div class="col-4">
                            <div class="text-secondary mb-1" style="font-size: 12px;">Số tiền</div>
                            <div class="fw-bold text-dark" style="font-size: 14px;">${amountStr} ${ord.currencyId}</div>
                        </div>
                        <div class="col-4">
                            <div class="text-secondary mb-1" style="font-size: 12px;">TG chờ thanh toán</div>
                            <div class="fw-bold text-danger" style="font-size: 14px;" id="orderCountdownTimer" data-seconds="${ord.transferLastSeconds || 0}">
                                ${window.formatTimeMmSs(ord.transferLastSeconds || 0)}
                            </div>
                        </div>
                    </div>
                    <div class="row border-bottom py-2">
                        <div class="col-4">
                            <div class="text-secondary mb-1" style="font-size: 12px;">PTTT đã sử dụng</div>
                            <div class="fw-bold text-dark" style="font-size: 14px;">${payInfo}</div>
                        </div>
                        <div class="col-8">
                            <div class="text-secondary mb-1" style="font-size: 12px;">PTTT (Seller cung cấp)</div>
                            <div class="fw-bold text-dark" style="font-size: 14px; word-wrap: break-word;">${fullPayDetails}</div>
                        </div>
                    </div>
                    
                    <div id="counterpartyContainer" class="mt-2">
                        <div class="card mt-3 border-0 shadow-sm" style="border: 1px solid #e0e0e0 !important; border-radius: 8px;">
                            <div class="card-body p-3 p-md-4">
                                <h6 class="fw-bold text-warning mb-2 text-uppercase" style="font-size: 15px;">ĐỐI TÁC</h6>
                                <hr style="border-color: #ffc107; border-width: 2px; opacity: 1; margin-top: -5px; margin-bottom: 15px;">
                                
                                <div class="row border-bottom pb-2 mb-2">
                                    <div class="col-6">
                                        <div class="text-secondary mb-1" style="font-size: 12px;">Real Name</div>
                                        <div class="fw-bold text-primary" style="font-size: 13px;">${realNameFormatted || 'N/A'}</div>
                                    </div>
                                    <div class="col-6">
                                        <div class="text-secondary mb-1" style="font-size: 12px;">Nickname | UID</div>
                                        <div class="fw-bold text-dark" style="font-size: 13px;">${pName} | UID ${ord.targetUserId || 'N/A'}</div>
                                    </div>
                                </div>
                                <div id="counterpartyExtraData">
                                    <div class="text-center text-muted py-2" style="font-size: 13px;"><i class="fas fa-spinner fa-spin"></i> Đang tải thêm thông tin...</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        } else {
            if (document.getElementById('orderActionButtons')) {
                document.getElementById('orderActionButtons').innerHTML = actionButtonsHtml;
            }
            if (document.getElementById('uiOrderStatus')) {
                const stEl = document.getElementById('uiOrderStatus');
                stEl.className = `fw-bold ${st ? st.class : 'text-dark'}`;
                stEl.innerText = st ? st.text : 'Unknown';
            }
            if (document.getElementById('orderCountdownTimer')) {
                const timerEl = document.getElementById('orderCountdownTimer');
                timerEl.setAttribute('data-seconds', ord.transferLastSeconds || 0);
                timerEl.innerText = window.formatTimeMmSs(ord.transferLastSeconds || 0);
            }
        }
    } catch(e) {
        console.error("Lỗi khi renderOrderInfo:", e);
    }
};

window.renderCounterpartyInfo = function(d) {
    const extraContainer = document.getElementById('counterpartyExtraData');
    if(!extraContainer) return;

    try {
        const regDate = new Date(parseInt(d.registerTime || 0) * 1000);
        const regStr = regDate.toLocaleDateString('vi-VN');
        
        const firstTradeDate = new Date();
        firstTradeDate.setDate(firstTradeDate.getDate() - parseInt(d.firstTradeDays || 0));
        const firstTradeStr = firstTradeDate.toLocaleDateString('vi-VN');

        const totalFinish = parseInt(d.totalFinishCount || 0);
        const totalTrade = parseFloat(d.totalTradeAmount || 0);
        const avgTotal = totalFinish > 0 ? (totalTrade / totalFinish).toLocaleString('en-US', {maximumFractionDigits:0}) : "0";

        const recentFinish = parseInt(d.recentFinishCount || 0);
        const recentTrade = parseFloat(d.recentTradeAmount || 0);
        const avgRecent = recentFinish > 0 ? (recentTrade / recentFinish).toLocaleString('en-US', {maximumFractionDigits:0}) : "0";

        const countryMap = { "VNM": "Vietnam (VNM)", "RUS": "Russian Federation (RUS)", "UKR": "Ukraine (UKR)", "KAZ": "Kazakhstan (KAZ)", "UZB": "Uzbekistan (UZB)" };
        const countryName = countryMap[d.kycCountryCode] || d.kycCountryCode || "Không rõ";

        const html = `
            <div class="row border-bottom pb-2 mb-2">
                <div class="col-6">
                    <div class="text-secondary mb-1" style="font-size: 12px;">Quốc gia | Cấp độ | Email</div>
                    <div class="fw-bold text-dark" style="font-size: 13px;">${countryName} | KYC: ${d.kycLevel || 0} | VIP: ${d.vipLevel || 0} | <br>${d.email || d.mobile || '***'}</div>
                </div>
                <div class="col-6">
                    <div class="text-secondary mb-1" style="font-size: 12px;">Ngày đăng ký</div>
                    <div class="fw-bold text-dark" style="font-size: 13px;">${regStr} - ${d.accountCreateDays || 0} ngày</div>
                </div>
            </div>

            <div class="row border-bottom pb-2 mb-2">
                <div class="col-6">
                    <div class="text-secondary mb-1" style="font-size: 12px;">Tổng số đơn đã hoàn thành</div>
                    <div class="fw-bold text-dark" style="font-size: 13px;">${totalFinish.toLocaleString('en-US')} (<span class="text-success">Mua: ${d.totalFinishBuyCount || 0}</span> | <span class="text-danger">Bán: ${d.totalFinishSellCount || 0}</span>)</div>
                </div>
                <div class="col-6">
                    <div class="text-secondary mb-1" style="font-size: 12px;">Tổng khối lượng và trung bình mỗi đơn (Toàn thời gian)</div>
                    <div class="fw-bold text-dark" style="font-size: 13px;">${totalTrade.toLocaleString('en-US', {maximumFractionDigits:0})} USDT | Trung bình ${avgTotal} USDT/đơn</div>
                </div>
            </div>

            <div class="row border-bottom pb-2 mb-2">
                <div class="col-6">
                    <div class="text-secondary mb-1" style="font-size: 12px;">Tỷ lệ hoàn thành & số đơn trong 30 ngày</div>
                    <div class="fw-bold text-dark" style="font-size: 13px;">${d.recentRate || 0}% | ${recentFinish} đơn | Trung bình ${avgRecent} USDT/đơn</div>
                </div>
                <div class="col-6">
                    <div class="text-secondary mb-1" style="font-size: 12px;">Thời gian mở khóa & chuyển tiền trung bình</div>
                    <div class="fw-bold text-dark" style="font-size: 13px;">Mở khóa: ${d.averageReleaseTime || 0} phút | Chuyển tiền: ${d.averageTransferTime || 0} phút</div>
                </div>
            </div>

            <div class="row">
                <div class="col-6">
                    <div class="text-secondary mb-1" style="font-size: 12px;">Giao dịch đầu</div>
                    <div class="fw-bold text-dark" style="font-size: 13px;">${firstTradeStr} - ${d.firstTradeDays || 0} ngày trước</div>
                </div>
                <div class="col-6">
                    <div class="text-secondary mb-1" style="font-size: 12px;">Tỷ lệ đánh giá tốt</div>
                    <div class="fw-bold text-dark" style="font-size: 13px;">${d.goodAppraiseRate || 0}% (<span class="text-success">Tốt: ${d.goodAppraiseCount || 0}</span> | <span class="text-danger">Xấu: ${d.badAppraiseCount || 0}</span>)</div>
                </div>
            </div>
        `;
        extraContainer.innerHTML = html;
        window.currentCounterpartyHtml = html; 
    } catch(e) {
        extraContainer.innerHTML = `<div class="text-danger text-center">Lỗi hiển thị dữ liệu đối tác</div>`;
    }
};

window.refreshOrderInfoBackground = async function(orderId) {
    if(!currentViewingOrder || currentViewingOrder.id !== orderId) return;
    const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
    try {
        const response = await fetch('/api/order_info', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { orderId: orderId } })
        });
        const data = await response.json();
        if (data.status === 'success' && currentViewingOrder && currentViewingOrder.id === orderId) {
            currentViewingOrder = data.data;
            window.renderOrderInfo(currentViewingOrder, false); 
        }
    } catch(e) {}
};

window.showOrderDetail = async function(orderId) {
    window.currentCounterpartyHtml = null; 
    
    if(document.getElementById('dtOrderIdVal')) document.getElementById('dtOrderIdVal').innerText = orderId;
    if(document.getElementById('dtAccountNameHeader')) document.getElementById('dtAccountNameHeader').innerText = `- ${selectedAccountName} (Nhóm: ${currentGroup})`;
    
    if(document.getElementById('orderDetailLoading')) document.getElementById('orderDetailLoading').classList.remove('d-none');
    if(document.getElementById('orderDetailBody')) document.getElementById('orderDetailBody').classList.add('d-none');
    
    // Reset Chat Box
    const chatArea = document.getElementById('chatMessagesArea');
    if (chatArea) chatArea.innerHTML = '<div class="text-center py-4 text-muted no-msg-indicator"><i class="fas fa-spinner fa-spin"></i> Đang tải trò chuyện...</div>';
    
    if(orderDetailModal) orderDetailModal.show();

    try {
        const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
        const response = await fetch('/api/order_info', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { orderId: orderId } })
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            const ord = data.data;
            currentViewingOrder = ord; 
            
            window.renderOrderInfo(ord, true); 

            if(document.getElementById('orderDetailLoading')) document.getElementById('orderDetailLoading').classList.add('d-none');
            if(document.getElementById('orderDetailBody')) document.getElementById('orderDetailBody').classList.remove('d-none');

            // API thông tin phụ
            fetch('/api/counterparty_info', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { originalUid: ord.targetUserId, orderId: ord.id } })
            }).then(r => r.json()).then(cpData => {
                if(cpData.status === 'success') {
                    window.renderCounterpartyInfo(cpData.data);
                } else {
                    const extraContainer = document.getElementById('counterpartyExtraData');
                    if(extraContainer) extraContainer.innerHTML = `<div class="text-danger p-2 text-center" style="font-size: 13px;">Lỗi tải thêm: ${cpData.message}</div>`;
                }
            }).catch(err => {
                const extraContainer = document.getElementById('counterpartyExtraData');
                if(extraContainer) extraContainer.innerHTML = `<div class="text-danger p-2 text-center" style="font-size: 13px;">Lỗi kết nối API đối tác</div>`;
            });

            if(orderCountdownInterval) clearInterval(orderCountdownInterval);
            orderCountdownInterval = setInterval(() => {
                const timerEl = document.getElementById('orderCountdownTimer');
                if(timerEl) {
                    let sec = parseInt(timerEl.getAttribute('data-seconds'));
                    if(sec > 0) {
                        sec--;
                        timerEl.setAttribute('data-seconds', sec);
                        timerEl.innerText = window.formatTimeMmSs(sec);
                    }
                }
            }, 1000);

            window.loadChatMessages();
            
            if(chatRefreshInterval) clearInterval(chatRefreshInterval);
            chatRefreshInterval = setInterval(() => {
                window.refreshOrderInfoBackground(ord.id);
                window.loadChatMessages();
            }, 3000); 
        } else {
            if(document.getElementById('orderDetailBody')) document.getElementById('orderDetailBody').innerHTML = `<div class="alert alert-danger text-center mt-3">${data.message}</div>`;
            if(document.getElementById('orderDetailLoading')) document.getElementById('orderDetailLoading').classList.add('d-none');
            if(document.getElementById('orderDetailBody')) document.getElementById('orderDetailBody').classList.remove('d-none');
        }
    } catch(e) {
        if(document.getElementById('orderDetailBody')) document.getElementById('orderDetailBody').innerHTML = `<div class="alert alert-danger text-center mt-3">Lỗi kết nối Server!</div>`;
        if(document.getElementById('orderDetailLoading')) document.getElementById('orderDetailLoading').classList.add('d-none');
        if(document.getElementById('orderDetailBody')) document.getElementById('orderDetailBody').classList.remove('d-none');
    }
};

window.loadChatMessages = async function() {
    const order = currentViewingOrder;
    if(!order) return;

    const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
    
    try {
        const response = await fetch('/api/chat_messages', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { orderId: order.id, size: "30" } })
        });
        const data = await response.json();

        if (!currentViewingOrder || currentViewingOrder.id !== order.id) return;

        if (data.status === 'success') {
            const msgs = data.data || [];
            const chatArea = document.getElementById('chatMessagesArea');
            if(!chatArea) return;
            
            if(msgs.length === 0) {
                if (!chatArea.querySelector('.msg-item')) {
                    chatArea.innerHTML = '<div class="text-center py-4 text-muted no-msg-indicator" style="width: 100%;">Chưa có tin nhắn nào.</div>';
                }
                return;
            }

            const noMsg = chatArea.querySelector('.no-msg-indicator');
            if(noMsg) noMsg.remove();

            let hasNewMsg = false;

            [...msgs].reverse().forEach(msg => {
                const msgId = msg.id || msg.msgId || msg.createDate;
                const isSystem = msg.msgType === 0;
                const isPartner = msg.userId === order.targetUserId;
                const isRead = msg.isRead === 1 || msg.isRead === true || msg.isRead === "1";
                
                let existingDiv = chatArea.querySelector(`[data-msg-id="${msgId}"]`);

                if (existingDiv) {
                    if (!isSystem && !isPartner) {
                        const tickIcon = existingDiv.querySelector('.msg-tick');
                        if (tickIcon) {
                            if (isRead) {
                                tickIcon.className = "msg-tick fas fa-check-double text-success ms-1";
                            } else {
                                tickIcon.className = "msg-tick fas fa-check text-secondary ms-1";
                            }
                        }
                    }
                    return; 
                }

                hasNewMsg = true;
                const timeStr = new Date(parseInt(msg.createDate)).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit', second:'2-digit'}) + ' ' + new Date(parseInt(msg.createDate)).toLocaleDateString('vi-VN');
                const div = document.createElement('div');
                div.className = "mb-3 w-100 msg-item";
                div.setAttribute('data-msg-id', msgId);
                
                if(isSystem) {
                    div.innerHTML = `<div class="text-center text-muted" style="font-size: 12.5px; margin: 15px 0;"><i class="fas fa-bullhorn text-danger me-1"></i> [Hệ thống] ${msg.message}</div>`;
                } else {
                    let msgText = typeof msg.message === 'string' ? msg.message : "";
                    let msgContent = `<div style="word-wrap: break-word; white-space: pre-wrap;">${msgText}</div>`;
                    let hasImage = false;
                    
                    if(msg.contentType === "pic" || msg.contentType === "IMAGE" || msg.msgType === 2 || msg.msgType === 6 || msgText.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                        let imgUrl = msgText;
                        hasImage = true;
                        if(imgUrl.startsWith('/')) imgUrl = "https://api.bybit.com" + imgUrl;
                        msgContent = `<a href="${imgUrl}" target="_blank"><img src="${imgUrl}" style="max-width: 100%; max-height: 200px; border-radius: 5px;" alt="Image"></a>`;
                    }

                    if (isPartner) {
                        let finalContentHtml = '';
                        if (!hasImage && msgText.trim().length > 0) {
                            if (window.autoTranslatedCache[msgId]) {
                                finalContentHtml = `
                                    <div style="word-wrap: break-word; white-space: pre-wrap;" class="text-success fw-bold">${window.autoTranslatedCache[msgId]}</div>
                                    <div class="mt-2 text-muted" style="font-size: 10.5px; border-top: 1px dashed #ccc; padding-top: 4px;">
                                        Gốc: <span style="color: #666;">${msgText}</span>
                                    </div>
                                `;
                            } else {
                                finalContentHtml = `
                                    <div id="trans_content_${msgId}">
                                        <div style="word-wrap: break-word; white-space: pre-wrap;">${msgText}</div>
                                        <div class="mt-2 text-info" style="font-size: 11px;">
                                            <i class="fas fa-spinner fa-spin"></i> Đang tự động dịch sát nghĩa P2P...
                                        </div>
                                    </div>
                                `;
                                
                                setTimeout(async () => {
                                    try {
                                        const promptContext = `Dịch nội dung sau sang tiếng Việt. Hãy dịch sát nghĩa và dùng từ ngữ của dân giao dịch P2P tiền điện tử (ví dụ: nhả coin, mở khóa, chuyển khoản, tiền đã vào, hóa đơn, biên lai, ngân hàng lỗi...). Chỉ trả về kết quả tiếng Việt, không giải thích:\n\n${msgText}`;
                                        const res = await fetch('/api/translate', {
                                            method: 'POST', 
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ text: promptContext, target_lang: 'vi' })
                                        });
                                        const dt = await res.json();
                                        const container = document.getElementById(`trans_content_${msgId}`);
                                        if (container) {
                                            if (dt.status === 'success') {
                                                window.autoTranslatedCache[msgId] = dt.data; 
                                                container.innerHTML = `
                                                    <div style="word-wrap: break-word; white-space: pre-wrap;" class="text-success fw-bold">${dt.data}</div>
                                                    <div class="mt-2 text-muted" style="font-size: 10.5px; border-top: 1px dashed #ccc; padding-top: 4px;">
                                                        Gốc: <span style="color: #666;">${msgText}</span>
                                                    </div>
                                                `;
                                            } else {
                                                container.innerHTML = `
                                                    <div style="word-wrap: break-word; white-space: pre-wrap;">${msgText}</div>
                                                    <div class="mt-2 text-danger" style="font-size: 11px;"><i class="fas fa-exclamation-triangle"></i> Lỗi dịch: ${dt.message}</div>
                                                `;
                                            }
                                        }
                                    } catch (err) {
                                        const container = document.getElementById(`trans_content_${msgId}`);
                                        if (container) {
                                            container.innerHTML = `
                                                <div style="word-wrap: break-word; white-space: pre-wrap;">${msgText}</div>
                                                <div class="mt-2 text-danger" style="font-size: 11px;"><i class="fas fa-exclamation-triangle"></i> Lỗi kết nối dịch</div>
                                            `;
                                        }
                                    }
                                }, 50);
                            }
                        } else {
                            finalContentHtml = msgContent; 
                        }

                        div.innerHTML = `
                            <div class="text-start">
                                <div class="mb-1" style="font-size: 11.5px;"><span class="fw-bold text-primary">${msg.nickName || 'Đối tác'}</span> <span class="text-muted ms-1">${timeStr}</span></div>
                                <div class="d-inline-block bg-white border p-3 rounded-3 shadow-sm position-relative" style="max-width: 85%; font-size: 14px; color: #333;">
                                    ${finalContentHtml}
                                </div>
                            </div>
                        `;
                    } else {
                        const tickHtml = isRead ? '<i class="msg-tick fas fa-check-double text-success ms-1"></i>' : '<i class="msg-tick fas fa-check text-secondary ms-1"></i>';
                        div.innerHTML = `
                            <div class="text-end">
                                <div class="mb-1 text-muted" style="font-size: 11.5px;">Tôi <span class="ms-1">${timeStr}</span> ${tickHtml}</div>
                                <div class="d-inline-block p-3 rounded-3 shadow-sm text-start" style="max-width: 85%; font-size: 14px; background-color: #fff9c4; border: 1px solid #f0e68c; color: #333;">
                                    ${msgContent}
                                </div>
                            </div>
                        `;
                    }
                }
                chatArea.appendChild(div);
            });

            if (hasNewMsg) {
                chatArea.scrollTop = chatArea.scrollHeight;
            }
        }
    } catch(e) { console.error("Lỗi tải chat", e); }
};

// --- LOGIC LOAD / THÊM CÂU TRẢ LỜI MẪU SONG NGỮ ---
window.loadChatTemplates = async function() {
    const listArea = document.getElementById('chatTemplatesListArea');
    if(!listArea) return;
    try {
        const res = await fetch('/api/chat_templates');
        const data = await res.json();
        if(data.status === 'success') {
            listArea.innerHTML = '';
            if (data.data.length === 0) {
                listArea.innerHTML = '<div class="text-muted text-center py-3">Chưa có câu mẫu nào. Bạn hãy thêm ở dưới nhé!</div>';
            }
            data.data.forEach(text => {
                let viText = text;
                let ruText = "";
                // Thử bóc tách JSON nếu là định dạng mới (Song ngữ)
                try {
                    let obj = JSON.parse(text);
                    if (obj.vi && obj.ru) {
                        viText = obj.vi;
                        ruText = obj.ru;
                    }
                } catch(e) {}
                
                const div = document.createElement('div');
                div.className = 'border rounded p-3 mb-2 bg-white shadow-sm position-relative template-item-box';
                div.style.cursor = 'pointer';
                div.style.transition = 'all 0.2s';
                
                // Hiệu ứng hover
                div.onmouseover = () => { div.style.backgroundColor = '#fdf5e6'; div.style.borderColor = '#ffc107'; };
                div.onmouseout = () => { div.style.backgroundColor = '#fff'; div.style.borderColor = '#dee2e6'; };

                div.innerHTML = `
                    <div class="fw-bold text-dark" style="font-size: 14px; margin-right: 25px;">${ruText || viText}</div>
                    ${ruText ? `<div class="text-secondary mt-1" style="font-size: 12px;"><i class="fas fa-language text-info"></i> ${viText}</div>` : ''}
                    <button type="button" class="btn btn-sm btn-link text-danger position-absolute btn-del-template p-0" style="top: 10px; right: 10px;" data-raw="${encodeURIComponent(text)}"><i class="fas fa-trash"></i></button>
                `;
                
                // Bấm chọn sẽ chèn tiếng NGA vào text input và tự đóng modal
                div.addEventListener('click', (e) => {
                    if(e.target.closest('.btn-del-template')) return;
                    const input = document.getElementById('chatInputMessage');
                    input.value = ruText || viText; 
                    
                    if(chatTemplatesModal) chatTemplatesModal.hide();
                    input.focus();
                });

                listArea.appendChild(div);
            });

            // Xóa mẫu
            listArea.querySelectorAll('.btn-del-template').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if(!confirm('Xóa câu mẫu này khỏi danh sách?')) return;
                    const textToDel = decodeURIComponent(e.currentTarget.dataset.raw);
                    await fetch('/api/chat_templates', {
                        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: textToDel })
                    });
                    window.loadChatTemplates();
                });
            });
        }
    } catch(e) { console.error("Lỗi tải câu mẫu:", e); }
};

document.addEventListener('DOMContentLoaded', () => {
    if (!isOrdersTab) return;

    if(document.getElementById('orderDetailModal')) {
        orderDetailModal = new bootstrap.Modal(document.getElementById('orderDetailModal'), { backdrop: 'static' });
        document.getElementById('orderDetailModal').addEventListener('hidden.bs.modal', () => {
            if(chatRefreshInterval) clearInterval(chatRefreshInterval);
            if(orderCountdownInterval) clearInterval(orderCountdownInterval);
            currentViewingOrder = null;
        });
    }

    if(document.getElementById('chatTemplatesModal')) {
        chatTemplatesModal = new bootstrap.Modal(document.getElementById('chatTemplatesModal'), { backdrop: false });
    }

    if(document.getElementById('btnShowChatTemplates')) {
        document.getElementById('btnShowChatTemplates').addEventListener('click', () => {
            if(chatTemplatesModal) {
                window.loadChatTemplates();
                chatTemplatesModal.show();
            }
        });
    }

    // Logic thêm câu mẫu mới (Tự dịch)
    if(document.getElementById('btnAddNewTemplate')) {
        document.getElementById('btnAddNewTemplate').addEventListener('click', async () => {
            const input = document.getElementById('newTemplateViInput');
            const textVi = input.value.trim();
            if(!textVi) return showToast('Vui lòng nhập câu tiếng Việt!', 'warning');

            const btn = document.getElementById('btnAddNewTemplate');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;

            try {
                // Tự động dịch sang Nga
                const promptRu = `Dịch câu này sang tiếng Nga (dùng cho P2P crypto, lịch sự, ngắn gọn):\n\n${textVi}`;
                const resTrans = await fetch('/api/translate', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: promptRu, target_lang: 'ru' })
                });
                const transData = await resTrans.json();
                
                if (transData.status === 'success') {
                    const textRu = transData.data;
                    const jsonToSave = JSON.stringify({ vi: textVi, ru: textRu });
                    
                    // Lưu mẫu định dạng JSON lên DB
                    await fetch('/api/chat_templates', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: jsonToSave })
                    });
                    
                    input.value = '';
                    window.loadChatTemplates();
                    showToast('Đã thêm câu mẫu Song Ngữ thành công!', 'success');
                } else {
                    showToast('Lỗi khi dịch tiếng Nga: ' + transData.message, 'danger');
                }
            } catch(e) {
                showToast('Lỗi kết nối khi thêm câu mẫu', 'danger');
            } finally {
                btn.innerHTML = '<i class="fas fa-plus"></i> LƯU';
                btn.disabled = false;
            }
        });
    }

    if(document.getElementById('btnSendChat')) {
        document.getElementById('btnSendChat').addEventListener('click', async () => {
            if(!currentViewingOrder) return;
            const input = document.getElementById('chatInputMessage');
            if(!input) return;
            const text = input.value.trim();
            if(!text) return;

            const btn = document.getElementById('btnSendChat');
            input.disabled = true; btn.disabled = true;

            try {
                const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
                const response = await fetch('/api/send_chat_message', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { orderId: currentViewingOrder.id, message: text, contentType: "text" } })
                });
                const data = await response.json();
                if (data.status === 'success') {
                    input.value = '';
                    window.loadChatMessages();
                } else { showToast("Gửi lỗi: " + data.message, "danger"); }
            } catch(e) { showToast("Lỗi kết nối", "danger"); } 
            finally {
                input.disabled = false; btn.disabled = false;
                input.focus();
            }
        });
    }

    if(document.getElementById('btnTranslateChat')) {
        document.getElementById('btnTranslateChat').addEventListener('click', async () => {
            const input = document.getElementById('chatInputMessage');
            const text = input.value.trim();
            if(!text) {
                showToast('Vui lòng nhập tin nhắn để dịch!', 'warning');
                return;
            }

            const btn = document.getElementById('btnTranslateChat');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;

            try {
                const promptRu = `Dịch sát nghĩa nội dung sau sang tiếng Nga để gửi cho khách hàng giao dịch P2P tiền điện tử. Dùng từ ngữ tự nhiên, lịch sự (ví dụ: kiểm tra tài khoản, gửi biên lai, sẽ nhả coin ngay...). Chỉ trả về tiếng Nga, tuyệt đối không giải thích thêm:\n\n${text}`;
                const res = await fetch('/api/translate', {
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: promptRu, target_lang: 'ru' })
                });
                const data = await res.json();
                
                if(data.status === 'success') {
                    input.value = data.data; 
                    showToast('Đã dịch sang Tiếng Nga thành công!', 'success');
                } else {
                    showToast(data.message, 'danger');
                }
            } catch(e) {
                showToast('Lỗi kết nối API dịch', 'danger');
            } finally {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                input.focus();
            }
        });
    }

    if(document.getElementById('chatInputMessage')) {
        document.getElementById('chatInputMessage').addEventListener('keypress', (e) => {
            if(e.key === 'Enter') document.getElementById('btnSendChat').click();
        });
    }

    if(document.getElementById('btnAttachFile')) {
        document.getElementById('btnAttachFile').addEventListener('click', () => {
            document.getElementById('chatFileInput').click();
        });
    }

    if(document.getElementById('chatFileInput')) {
        document.getElementById('chatFileInput').addEventListener('change', async (e) => {
            if(!currentViewingOrder || !e.target.files.length) return;
            const file = e.target.files[0];
            if(file.size > 5 * 1024 * 1024) return showToast("File quá lớn (Tối đa 5MB)!", "danger");

            const btnAttach = document.getElementById('btnAttachFile');
            btnAttach.disabled = true; btnAttach.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('group', currentGroup);
                formData.append('account_index', selectedAccountIndex);
                formData.append('proxy_ip', document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "");
                formData.append('proxy_port', document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "");
                formData.append('proxy_user', document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "");
                formData.append('proxy_pass', document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "");

                const resUpload = await fetch('/api/upload_chat_file', { method: 'POST', body: formData });
                const dataUpload = await resUpload.json();
                
                if (dataUpload.status === 'success' && dataUpload.data.url) {
                    const fileUrl = dataUpload.data.url;
                    const fileType = dataUpload.data.type === "IMAGE" ? "pic" : "pdf"; 

                    const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
                    const resSend = await fetch('/api/send_chat_message', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, 
                            payload: { orderId: currentViewingOrder.id, message: fileUrl, contentType: fileType } 
                        })
                    });
                    const dataSend = await resSend.json();
                    
                    if (dataSend.status === 'success') {
                        showToast("Đã gửi ảnh thành công!", "success");
                        window.loadChatMessages();
                    } else {
                        showToast("Lỗi gửi tin nhắn: " + dataSend.message, "danger");
                    }
                } else {
                    showToast(dataUpload.message, "danger");
                }
            } catch(err) {
                showToast("Lỗi kết nối khi tải ảnh", "danger");
            } finally {
                btnAttach.disabled = false; btnAttach.innerHTML = '<i class="fas fa-plus fw-bold"></i>';
                e.target.value = ""; 
            }
        });
    }

    document.getElementById('orderDetailBody')?.addEventListener('click', (e) => {
        const btnPaid = e.target.closest('#btnMarkAsPaid');
        if (btnPaid) {
            const orderId = btnPaid.getAttribute('data-order');
            const pType = btnPaid.getAttribute('data-ptype');
            const pId = btnPaid.getAttribute('data-pid');

            if (!pType || !pId) return showToast("Lỗi: Không tìm thấy ID/Type của phương thức thanh toán!", "danger");
            
            if(!currentViewingOrder) return;
            const ord = currentViewingOrder;
            const amountStr = parseFloat(ord.amount).toLocaleString();
            const qtyStr = parseFloat(ord.quantity).toLocaleString();

            const msgHtml = `
                <div class="text-start d-inline-block">
                    Mã đơn: <b class="text-primary">${orderId}</b><br>
                    Tiền Fiat: <b class="text-success">${amountStr} ${ord.currencyId}</b><br>
                    Coin: <b>${qtyStr} ${ord.tokenId}</b>
                </div>
            `;

            window.showCustomConfirm(
                "Xác nhận thanh toán",
                msgHtml,
                "XÁC NHẬN",
                "btn-success",
                async () => {
                    btnPaid.disabled = true;
                    btnPaid.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

                    try {
                        const proxyConfig = { ip: document.getElementById('proxyIp')?.value.trim() || "", port: document.getElementById('proxyPort')?.value.trim() || "", user: document.getElementById('proxyUser')?.value.trim() || "", pass: document.getElementById('proxyPass')?.value.trim() || "" };
                        const res = await fetch('/api/mark_paid', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { orderId: orderId, paymentType: pType, paymentId: pId } })
                        });
                        const data = await res.json();
                        if (data.status === 'success') {
                            showToast("Đã báo thanh toán thành công!", "success");
                            window.refreshOrderInfoBackground(orderId);
                        } else { showToast("Lỗi: " + data.message, "danger"); }
                    } catch (err) { showToast("Lỗi kết nối API!", "danger"); }
                    finally { btnPaid.disabled = false; btnPaid.innerHTML = '<i class="fas fa-check-circle"></i> Đã thanh toán'; }
                }
            );
        }

        const btnRelease = e.target.closest('#btnReleaseAssets');
        if (btnRelease) {
            const orderId = btnRelease.getAttribute('data-order');
            
            if(!currentViewingOrder) return;
            const ord = currentViewingOrder;
            const amountStr = parseFloat(ord.amount).toLocaleString();
            const qtyStr = parseFloat(ord.quantity).toLocaleString();

            const msgHtml = `
                <div class="text-start d-inline-block">
                    Mã đơn: <b class="text-primary">${orderId}</b><br>
                    Tiền Fiat: <b class="text-success">${amountStr} ${ord.currencyId}</b><br>
                    Coin: <b class="text-danger">${qtyStr} ${ord.tokenId}</b>
                </div>
            `;

            window.showCustomConfirm(
                "Xác nhận mở khóa",
                msgHtml,
                "MỞ KHÓA ĐƠN",
                "btn-warning text-dark",
                async () => {
                    btnRelease.disabled = true;
                    btnRelease.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

                    try {
                        const proxyConfig = { ip: document.getElementById('proxyIp')?.value.trim() || "", port: document.getElementById('proxyPort')?.value.trim() || "", user: document.getElementById('proxyUser')?.value.trim() || "", pass: document.getElementById('proxyPass')?.value.trim() || "" };
                        const res = await fetch('/api/release_assets', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { orderId: orderId } })
                        });
                        const data = await res.json();
                        if (data.status === 'success') {
                            showToast("Đã nhả coin thành công!", "success");
                            window.refreshOrderInfoBackground(orderId);
                        } else { showToast("Lỗi: " + data.message, "danger"); }
                    } catch (err) { showToast("Lỗi kết nối API!", "danger"); }
                    finally { btnRelease.disabled = false; btnRelease.innerHTML = '<i class="fas fa-unlock-alt"></i> Mở khóa đơn'; }
                }
            );
        }
    });

    // Mẫu load khi bắt đầu không cần vì đã đưa vào modal popup
});