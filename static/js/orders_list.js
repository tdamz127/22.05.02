let pendingIds = new Set();
let previouslyNotifiedIds = new Set();
let listCountdownInterval = null; 

window.__firstPendingPoll = true;
window.currentPendingPage = 1;
window.currentOldPage = 1;

// Format thời gian đếm ngược (M:SS)
window.formatTimeMmSs = function(totalSeconds) {
    if(!totalSeconds || totalSeconds < 0) return "00:00";
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? '0'+s : s}`;
};

// Render Thanh phân trang (UI giống hệt hình)
window.renderPagination = function(containerId, currentPage, totalItems, itemsPerPage, onPageClick) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    let totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return; // Nếu <= 1 trang thì ẩn luôn thanh phân trang
    
    const createPageBox = (text, pageNum, extraClass = '') => {
        const div = document.createElement('div');
        div.className = `page-box ${extraClass}`;
        div.innerHTML = text;
        if (!extraClass.includes('disabled') && !extraClass.includes('active') && !extraClass.includes('dots')) {
            div.addEventListener('click', () => onPageClick(pageNum));
        }
        return div;
    };

    const paginationWrap = document.createElement('div');
    paginationWrap.className = 'custom-pagination';

    // Nút Trước
    paginationWrap.appendChild(createPageBox('<i class="fas fa-chevron-left" style="font-size: 12px;"></i>', currentPage - 1, currentPage === 1 ? 'disabled' : ''));

    // Thuật toán hiển thị ... giống hình 
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) {
            paginationWrap.appendChild(createPageBox(i, i, i === currentPage ? 'active' : ''));
        }
    } else {
        if (currentPage <= 4) {
            for (let i = 1; i <= 5; i++) {
                paginationWrap.appendChild(createPageBox(i, i, i === currentPage ? 'active' : ''));
            }
            paginationWrap.appendChild(createPageBox('...', null, 'dots'));
            paginationWrap.appendChild(createPageBox(totalPages, totalPages, ''));
        } else if (currentPage >= totalPages - 3) {
            paginationWrap.appendChild(createPageBox(1, 1, ''));
            paginationWrap.appendChild(createPageBox('...', null, 'dots'));
            for (let i = totalPages - 4; i <= totalPages; i++) {
                paginationWrap.appendChild(createPageBox(i, i, i === currentPage ? 'active' : ''));
            }
        } else {
            paginationWrap.appendChild(createPageBox(1, 1, ''));
            paginationWrap.appendChild(createPageBox('...', null, 'dots'));
            paginationWrap.appendChild(createPageBox(currentPage - 1, currentPage - 1, ''));
            paginationWrap.appendChild(createPageBox(currentPage, currentPage, 'active'));
            paginationWrap.appendChild(createPageBox(currentPage + 1, currentPage + 1, ''));
            paginationWrap.appendChild(createPageBox('...', null, 'dots'));
            paginationWrap.appendChild(createPageBox(totalPages, totalPages, ''));
        }
    }

    // Nút Sau
    paginationWrap.appendChild(createPageBox('<i class="fas fa-chevron-right" style="font-size: 12px;"></i>', currentPage + 1, currentPage === totalPages ? 'disabled' : ''));

    container.appendChild(paginationWrap);
};


window.sendTelegramNotification = async function(order) {
    const _logEvent = (kind, status, message) => {
        try {
            console.log('__BOT_EVENT__' + JSON.stringify({
                kind: kind, status: status, message: message,
                order_id: order ? order.id : '',
                side: order ? (order.side === 0 ? 'MUA' : 'BÁN') : '',
                price: order ? order.price : '',
                amount: order ? order.amount : ''
            }));
        } catch(e) {}
    };

    if(typeof SERVER_CONFIG === 'undefined') {
        _logEvent('tele_skip', 'error', 'SERVER_CONFIG undefined');
        return;
    }
    const token  = SERVER_CONFIG.tele_bot_token || (document.getElementById('teleBotToken') ? document.getElementById('teleBotToken').value.trim() : "");
    const chatId = SERVER_CONFIG.tele_chat_id   || (document.getElementById('teleChatId')   ? document.getElementById('teleChatId').value.trim()   : "");
    if(!token || !chatId) {
        _logEvent('tele_skip', 'error', `token=${token ? 'OK' : 'EMPTY'} chatId=${chatId ? 'OK' : 'EMPTY'}`);
        return; 
    }

    _logEvent('tele_call', 'info', 'sending...');

    const typeStr    = order.side === 0 ? "🟢 MUA" : "🔴 BÁN";
    const amountFiat = parseFloat(order.amount).toLocaleString() + " " + order.currencyId;
    const qtyToken   = (parseFloat(order.amount) / parseFloat(order.price)).toLocaleString(undefined, {maximumFractionDigits: 2}) + " " + order.tokenId;
    const priceStr   = parseFloat(order.price).toLocaleString();
    const partner    = order.targetNickName || order.buyerRealName || order.sellerRealName || 'N/A';

    const text = `🚨 *ĐƠN HÀNG P2P MỚI* 🚨\n\n` +
                 `📦 Loại: *${typeStr}*\n` +
                 `🆔 ID: \`${order.id}\`\n` +
                 `💰 Tiền: *${amountFiat}*\n` +
                 `🪙 Số lượng: *${qtyToken}*\n` +
                 `💵 Tỷ giá: ${priceStr}\n` +
                 `👤 Khách: ${partner}`;

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
        });
        const data = await res.json().catch(() => ({}));
        _logEvent('tele_send', data.ok ? 'success' : 'error',
                  data.ok ? 'OK' : (data.description || `HTTP ${res.status}`));
    } catch(e) {
        console.error("Lỗi gửi Telegram", e);
        _logEvent('tele_send', 'error', e.message || String(e));
    }
};

window.resolveFinishedKztOrders = async function(currentPendingKztIds) {
    if(typeof SERVER_CONFIG === 'undefined') return;
    if(!SERVER_CONFIG.bankBalances) SERVER_CONFIG.bankBalances = { freedom: "", bcc: "", pendingKztIds: [], processedKztIds: [] };
    if(!SERVER_CONFIG.bankBalances.pendingKztIds) SERVER_CONFIG.bankBalances.pendingKztIds = [];
    if(!SERVER_CONFIG.bankBalances.processedKztIds) SERVER_CONFIG.bankBalances.processedKztIds = [];

    let dbPending = SERVER_CONFIG.bankBalances.pendingKztIds;
    let dbProcessed = SERVER_CONFIG.bankBalances.processedKztIds;
    let needsDbUpdate = false;

    let disappearedIds = dbPending.filter(id => !currentPendingKztIds.includes(id));
    
    for(let id of disappearedIds) {
        if(dbProcessed.includes(id)) continue; 
        
        const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
        try {
            const res = await fetch('/api/order_info', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { orderId: id } })
            });
            const d = await res.json();
            if(d.status === 'success') {
                const ord = d.data;
                if(ord.status === 50) { 
                    let payName = "";
                    if (ord.confirmedPayTerm && ord.confirmedPayTerm.paymentConfigVo) {
                        payName = ord.confirmedPayTerm.paymentConfigVo.paymentName;
                    } else if (ord.paymentTermList && ord.paymentTermList.length > 0 && ord.paymentTermList[0].paymentConfigVo) {
                        payName = ord.paymentTermList[0].paymentConfigVo.paymentName;
                    }
                    payName = payName.toLowerCase();
                    
                    let isFreedom = payName.includes("freedom");
                    let isBCC = payName.includes("center credit") || payName.includes("bcc") || payName.includes("centercredit");
                    
                    if(isFreedom || isBCC) {
                        let amountStr = (ord.amount || "0").toString().replace(/,/g, '').replace(/\s/g, '');
                        let amount = parseFloat(amountStr) || 0;
                        let isSell = ord.side === 1; 
                        let change = isSell ? amount : -amount;
                        
                        if(isFreedom && document.getElementById('bankFreedom')) {
                            let valStr = document.getElementById('bankFreedom').value || "0";
                            let currentFreedom = parseFloat(valStr.toString().replace(/,/g, '').replace(/\s/g, '')) || 0;
                            document.getElementById('bankFreedom').value = (currentFreedom + change).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                        } else if(isBCC && document.getElementById('bankBCC')) {
                            let valStr = document.getElementById('bankBCC').value || "0";
                            let currentBcc = parseFloat(valStr.toString().replace(/,/g, '').replace(/\s/g, '')) || 0;
                            document.getElementById('bankBCC').value = (currentBcc + change).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                        }
                        showToast(`Đơn ${id} hoàn thành: ${isSell ? '+' : '-'}${amount.toLocaleString()} KZT vào ${isFreedom ? 'Freedom' : 'BCC'}`, 'success');
                        needsDbUpdate = true;
                    }
                }
                dbProcessed.push(id);
                needsDbUpdate = true;
            }
        } catch(e) { console.error("Lỗi tracking đơn KZT", id); }
    }

    let newPendingDb = [...currentPendingKztIds];
    if(newPendingDb.sort().join(',') !== dbPending.sort().join(',')) {
        SERVER_CONFIG.bankBalances.pendingKztIds = newPendingDb;
        needsDbUpdate = true;
    }
    
    if(needsDbUpdate) {
        SERVER_CONFIG.bankBalances.processedKztIds = dbProcessed;
        const fullState = window.getFullConfigState(true); 
        await fetch('/api/config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fullState)
        });
    }
};

window.renderOrderTable = function(tbodyId, items) {
    const tbody = document.getElementById(tbodyId);
    if(!tbody) return;

    if(items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Không có đơn hàng nào.</td></tr>';
        return;
    }
    
    const fragment = document.createDocumentFragment();

    items.forEach(ord => {
        const dateStr = new Date(parseInt(ord.createDate)).toLocaleDateString('vi-VN') + ' ' + new Date(parseInt(ord.createDate)).toLocaleTimeString('vi-VN');
        const sideHtml = ord.side === 0 ? '<span class="badge bg-success">MUA</span>' : '<span class="badge bg-danger">BÁN</span>';
        const price = parseFloat(ord.price).toLocaleString();
        
        const amountFiat = parseFloat(ord.amount).toLocaleString();
        const qtyUSDT = (parseFloat(ord.amount) / parseFloat(ord.price)).toLocaleString(undefined, {maximumFractionDigits: 2});
        
        const realName = ord.side === 0 ? ord.sellerRealName : ord.buyerRealName;

        let statusBadge = 'bg-secondary';
        let countdownHtml = '';

        if(ord.status === 10) {
            statusBadge = 'bg-warning text-dark'; 
            const sec = parseInt(ord.transferLastSeconds || 0);
            if(sec > 0) {
                countdownHtml = `<div class="mt-1 fw-bold text-danger order-countdown-timer" style="font-size: 13px;" data-seconds="${sec}"><i class="fas fa-clock"></i> ${window.formatTimeMmSs(sec)}</div>`;
            }
        } 
        else if(ord.status === 20) statusBadge = 'bg-info text-white'; 
        else if(ord.status === 60) statusBadge = 'bg-warning text-dark'; 
        else if(ord.status === 30 || ord.status === 100 || ord.status === 110) statusBadge = 'bg-danger';
        else if(ord.status === 50) statusBadge = 'bg-success';

        let rawUnread = parseInt(ord.newMsgNum || ord.unReadMsgCount || ord.unreadMsgCount || ord.newMsgCount || 0);
        let displayUnread = rawUnread;
        let maskKey = `unread_mask_${ord.id}`;
        let savedMask = parseInt(localStorage.getItem(maskKey)) || 0;

        // Xử lý bộ nhớ đệm
        if (window.currentViewingOrder && window.currentViewingOrder.id === ord.id) {
            localStorage.setItem(maskKey, rawUnread.toString());
            displayUnread = 0;
        } else if (savedMask > 0) {
            if (rawUnread <= savedMask) {
                displayUnread = 0; 
            } else {
                displayUnread = rawUnread - savedMask; 
            }
        }

        // Dọn rác
        if (rawUnread === 0 || ord.status === 50 || ord.status === 30) {
            localStorage.removeItem(maskKey);
            displayUnread = 0;
        }

        const unreadBadge = displayUnread > 0 ? `<span class="badge bg-danger ms-2 rounded-pill shadow-sm" style="font-size: 11px; padding: 3px 6px;"><i class="fas fa-comment-dots"></i> ${displayUnread}</span>` : '';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="fw-bold text-dark">${dateStr}</div>
                <div class="text-secondary mt-1 d-flex align-items-center" style="font-size: 12px;">
                    ID: <a href="javascript:void(0)" class="order-detail-link text-decoration-none fw-bold ms-1" data-id="${ord.id}" data-raw-unread="${rawUnread}">${ord.id}</a>
                    ${unreadBadge}
                </div>
            </td>
            <td>
                <div class="fw-bold text-primary" style="font-size: 14.5px;">${ord.targetNickName || 'N/A'}</div>
                <div style="font-size: 11px; color: #848e9c;">Real: <span class="fw-bold text-dark">${realName || 'N/A'}</span> | UID: ${ord.targetUserId || 'N/A'}</div>
            </td>
            <td>
                <div class="fw-bold text-dark" style="font-size: 16px;">${qtyUSDT} <span class="text-secondary" style="font-size: 12px;">${ord.tokenId}</span></div>
                <div class="fw-bold mt-1 text-success" style="font-size: 14.5px;">${amountFiat} <span class="text-secondary" style="font-size: 12px;">${ord.currencyId}</span></div>
            </td>
            <td>${sideHtml} <span class="fw-bold ms-1 fs-5 text-dark">${price}</span></td>
            <td>
                <span class="badge ${statusBadge}">${window.getOrderStatusConfig ? window.getOrderStatusConfig(ord.status).text : 'Unknown'}</span>
                ${countdownHtml}
            </td>
        `;
        fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);

    // Xử lý SỰ KIỆN CLICK LƯU LOCAL NGAY LẬP TỨC
    tbody.querySelectorAll('.order-detail-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const tr = e.currentTarget.closest('tr');
            if (tr) {
                const badge = tr.querySelector('.badge.bg-danger');
                if (badge && badge.innerHTML.includes('fa-comment-dots')) {
                    badge.remove(); 
                }
            }
            
            // LƯU NGAY LẬP TỨC KHI CLICK ĐỂ CHỐNG F5
            const orderId = e.currentTarget.dataset.id;
            const currentRaw = parseInt(e.currentTarget.dataset.rawUnread) || 0;
            if (currentRaw > 0) {
                localStorage.setItem(`unread_mask_${orderId}`, currentRaw.toString());
            }

            window.showOrderDetail && window.showOrderDetail(orderId);
        });
    });

    if(listCountdownInterval) clearInterval(listCountdownInterval);
    listCountdownInterval = setInterval(() => {
        document.querySelectorAll('.order-countdown-timer').forEach(el => {
            let s = parseInt(el.getAttribute('data-seconds'));
            if(s > 0) {
                s--;
                el.setAttribute('data-seconds', s);
                el.innerHTML = `<i class="fas fa-clock"></i> ${window.formatTimeMmSs(s)}`;
            } else {
                el.innerHTML = `<i class="fas fa-clock"></i> 0:00`;
            }
        });
    }, 1000);
};

// Helper: kiểm tra tbody có dữ liệu thật (không phải spinner/empty)
function _tbodyHasData(tbody) {
    if (!tbody) return false;
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return false;
    // Nếu row đầu có td với colspan = đang ở trạng thái spinner/empty/error
    const firstTd = rows[0].querySelector('td[colspan]');
    return !firstTd;
}

// CẬP NHẬT LOAD PENDING HỖ TRỢ PHÂN TRANG (silent = true: âm thầm refresh, không xóa bảng)
window.loadPendingOrders = async function(page = 1, silent = false) {
    window.currentPendingPage = page;
    const tbody = document.getElementById('pendingOrdersBody');
    if(!tbody) return;

    // Silent mode: TUYỆT ĐỐI không đụng vào bảng cho đến khi có data mới
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><i class="fas fa-spinner fa-spin text-primary fa-2x"></i></td></tr>';
    }

    try {
        const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
        const response = await fetch('/api/pending_orders', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { page: page, size: 10 } }) // SIZE 10 ĐỂ CHIA TRANG
        });
        const data = await response.json();
        if (data.status === 'success') {
            const items = data.data?.items || [];
            
            // Tính tổng số đơn (nếu sàn không trả về count thì tự ước lượng)
            const totalItems = parseInt(data.data?.count || data.data?.total || data.data?.totalCount || (items.length === 10 ? page * 10 + 1 : page * 10 - 10 + items.length));
            
            console.log('__BOT_EVENT__' + JSON.stringify({
                kind: 'pending_loaded', status: 'info',
                message: `items=${items.length} page=${page} prevNotified=${previouslyNotifiedIds.size} pendingIds=${pendingIds.size}`
            }));

            // Chỉ gửi thông báo Telegram nếu đang ở Trang 1 (Tránh spam thông báo khi lật trang cũ)
            if (page === 1) {
                items.forEach(ord => {
                    if (!previouslyNotifiedIds.has(ord.id)) {
                        previouslyNotifiedIds.add(ord.id);
                        if (!window.__firstPendingPoll) {    // ← chỉ skip ĐÚNG vòng đầu tiên sau khi load page
                            window.sendTelegramNotification(ord);
                        }
                    }
                });
                pendingIds = new Set(items.map(i => i.id));
                window.__firstPendingPoll = false;           // sau vòng đầu, luôn cho phép bắn
            }
            
            window.renderOrderTable('pendingOrdersBody', items);
            window.renderPagination('pendingPagination', page, totalItems, 10, window.loadPendingOrders);
            
            if(document.getElementById('timeRefreshPending')) document.getElementById('timeRefreshPending').innerText = window.getTimestampStr();
            
            const confArea = document.getElementById('configArea');
            if(confArea && confArea.classList.contains('locked-overlay') && page === 1) {
                const currentPendingKztIds = items.filter(i => i.currencyId === "KZT").map(i => i.id);
                await window.resolveFinishedKztOrders(currentPendingKztIds);
            }
        } else {
            // Silent mode: không ghi đè bảng cũ nếu có dữ liệu
            if (!silent || !_tbodyHasData(tbody)) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Lỗi kết nối Server!</td></tr>`;
            } else {
                console.error('[Pending auto-refresh] Lỗi kết nối:', e);
            }
        }
    } catch(e) {
        if (!silent || !_tbodyHasData(tbody)) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Lỗi kết nối Server!</td></tr>`;
        } else {
            console.error('[Pending auto-refresh] Lỗi kết nối:', e);
        }
    }
};

// CẬP NHẬT LOAD OLD ORDERS HỖ TRỢ PHÂN TRANG
window.loadOldOrders = async function(page = 1, silent = false) {
    window.currentOldPage = page;
    const tbody = document.getElementById('oldOrdersBody');
    if(!tbody) return;

    if (!silent || !_tbodyHasData(tbody)) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><i class="fas fa-spinner fa-spin text-primary fa-2x"></i></td></tr>';
    }

    try {
        const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
        const response = await fetch('/api/all_orders', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { page: page, size: 10 } }) // SIZE 10
        });
        const data = await response.json();
        if (data.status === 'success') {
            let items = data.data?.items || [];
            
            const totalItems = parseInt(data.data?.count || data.data?.total || data.data?.totalCount || (items.length === 10 ? page * 10 + 1 : page * 10 - 10 + items.length));
            
            // Xóa các đơn đang pending khỏi list cũ
            items = items.filter(ord => !pendingIds.has(ord.id));
            
            window.renderOrderTable('oldOrdersBody', items);
            window.renderPagination('oldPagination', page, totalItems, 10, window.loadOldOrders);
            
            if(document.getElementById('timeRefreshOld')) document.getElementById('timeRefreshOld').innerText = window.getTimestampStr();
        } else {
            if (!silent) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Lỗi kết nối Server!</td></tr>`;
            } else {
                console.error('[Pending auto-refresh] Lỗi kết nối:', e);
            }
        }
    } catch(e) {
        if (!silent || !_tbodyHasData(tbody)) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Lỗi kết nối Server!</td></tr>`;
        } else {
            console.error('[Old auto-refresh] Lỗi kết nối:', e);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (!isOrdersTab) return;

    document.querySelectorAll('#ordersSubTabs .nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('#ordersSubTabs .nav-link').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            const targetId = e.target.dataset.target;
            if(document.getElementById('pendingOrdersList')) document.getElementById('pendingOrdersList').classList.add('d-none');
            if(document.getElementById('oldOrdersList')) document.getElementById('oldOrdersList').classList.add('d-none');
            if(document.getElementById(targetId)) document.getElementById(targetId).classList.remove('d-none');
            
            if (targetId === 'pendingOrdersList') window.loadPendingOrders(1);
            if (targetId === 'oldOrdersList') window.loadOldOrders(1);
        });
    });

    if(document.getElementById('btnRefreshPending')) {
        document.getElementById('btnRefreshPending').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
            // Refresh thủ công cũng silent để không chớp bảng
            await window.loadPendingOrders(window.currentPendingPage, true);
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        });
    }

    if(document.getElementById('btnRefreshOld')) {
        document.getElementById('btnRefreshOld').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
            await window.loadOldOrders(window.currentOldPage, true);
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        });
    }

    if(document.getElementById('btnEditBank')) {
        document.getElementById('btnEditBank').addEventListener('click', () => {
            document.getElementById('bankFreedom').disabled = false;
            document.getElementById('bankBCC').disabled = false;
            document.getElementById('btnEditBank').classList.add('d-none');
            document.getElementById('btnSaveBank').classList.remove('d-none');
            document.getElementById('bankFreedom').focus();
        });
    }

    if(document.getElementById('btnSaveBank')) {
        document.getElementById('btnSaveBank').addEventListener('click', async () => {
            const btnSave = document.getElementById('btnSaveBank');
            btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
            btnSave.disabled = true;

            try {
                const fullState = window.getFullConfigState(true); 
                const res = await fetch('/api/config', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fullState)
                });
                const data = await res.json();
                if (data.status === 'success') {
                    showToast('Lưu số dư ngân hàng thành công!', 'success');
                    if(typeof SERVER_CONFIG !== 'undefined') SERVER_CONFIG.bankBalances = fullState.bankBalances;
                    
                    document.getElementById('bankFreedom').disabled = true;
                    document.getElementById('bankBCC').disabled = true;
                    document.getElementById('btnSaveBank').classList.add('d-none');
                    document.getElementById('btnEditBank').classList.remove('d-none');
                } else { showToast('Lỗi lưu ngân hàng: ' + data.message, 'danger'); }
            } catch(e) { showToast('Lỗi kết nối khi lưu ngân hàng', 'danger'); } 
            finally { btnSave.innerHTML = '<i class="fas fa-save"></i> Lưu KZT'; btnSave.disabled = false; }
        });
    }
});