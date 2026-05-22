// --- HÀM QUẢN LÝ LƯU TRỮ TUYỆT ĐỐI ---
window.getAutoUpdateAds = window.getAutoUpdateAds || function() {
    try { return new Set(JSON.parse(localStorage.getItem('autoUpdateAds') || '[]')); } 
    catch(e) { return new Set(); }
};
window.setAutoUpdateAds = window.setAutoUpdateAds || function(setObj) {
    localStorage.setItem('autoUpdateAds', JSON.stringify(Array.from(setObj)));
    window.autoUpdateAds = setObj;
};

window.getTimestampStr = function() {
    const now = new Date();
    return `Cập nhật: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
};

window.formatTimeMmSs = function(seconds) {
    if (!seconds || seconds <= 0) return "00:00";
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

window.getOrderStatusConfig = function(status) {
    switch(status) {
        case 5: return { text: "Chờ xác nhận chuỗi", class: "text-dark" };
        case 10: return { text: "Chờ thanh toán", class: "text-warning" };
        case 20: return { text: "Chờ mở khóa", class: "text-warning" };
        case 30: return { text: "Đang khiếu nại", class: "text-danger" };
        case 40: return { text: "Đã hủy", class: "text-secondary" };
        case 50: return { text: "Hoàn thành", class: "text-dark" };
        case 60: return { text: "Đang thanh toán", class: "text-info" };
        case 70: return { text: "Thanh toán thất bại", class: "text-danger" };
        case 80: return { text: "Hủy do ngoại lệ", class: "text-secondary" };
        case 90: return { text: "Chờ chọn Token", class: "text-info" };
        case 100: return { text: "Đang phản đối", class: "text-danger" };
        case 110: return { text: "Chờ nêu phản đối", class: "text-warning" };
        default: return { text: `Không xác định (${status})`, class: "text-dark" };
    }
};

window.loadUsdtBalance = async function() {
    const btn = document.getElementById('btnRefreshUsdt');
    if(!btn) return;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Làm mới USDT';
    
    try {
        const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
        const response = await fetch('/api/usdt_balance', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig })
        });
        const resData = await response.json();
        
        if (resData.status === 'success') {
            let totalAvail = 0, totalLock = 0;
            ['FUND', 'UNIFIED', 'EARN'].forEach(type => {
                let avail = 0, lock = 0;
                const accData = resData.data[type];
                if (accData && accData.retCode === 0 && accData.result && accData.result.balance) {
                    const usdtObj = accData.result.balance.find(b => b.coin === "USDT");
                    if (usdtObj) {
                        const walletBal = parseFloat(usdtObj.walletBalance || 0);
                        avail = parseFloat(usdtObj.transferBalance || 0);
                        lock = walletBal - avail;
                    }
                }
                totalAvail += avail; totalLock += lock;
                const prefix = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
                if(document.getElementById(`bal${prefix}Avail`)) document.getElementById(`bal${prefix}Avail`).innerText = avail.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
                if(document.getElementById(`bal${prefix}Lock`)) document.getElementById(`bal${prefix}Lock`).innerText = lock.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            });
            
            if(document.getElementById('balTotalAvail')) document.getElementById('balTotalAvail').innerText = totalAvail.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            if(document.getElementById('balTotalLock')) document.getElementById('balTotalLock').innerText = totalLock.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            if(document.getElementById('balTotalAll')) document.getElementById('balTotalAll').innerText = (totalAvail + totalLock).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
            
            if(document.getElementById('timeRefreshUsdt')) document.getElementById('timeRefreshUsdt').innerText = window.getTimestampStr();
        }
    } catch(e) { console.error("Lỗi lấy số dư", e); } 
    finally { btn.innerHTML = '<i class="fas fa-sync-alt"></i> Làm mới USDT'; }
};

document.addEventListener('DOMContentLoaded', () => {
    if (!isOrdersTab) return;

    window.myPersonalAds_OrdersTab = [];
    window.autoUpdateAds = window.getAutoUpdateAds();

    // TỰ ĐỘNG ĐỒNG BỘ "GỢI Ý ĐẶT GIÁ"
    setInterval(() => {
        try {
            const targetEls = Array.from(document.querySelectorAll('#ordersSection div')).filter(el => 
                el.textContent.includes('GỢI Ý ĐẶT GIÁ') && el.textContent.includes('Biên lợi nhuận')
            );
            if (targetEls.length === 0) return;
            
            let targetPanel = targetEls[targetEls.length - 1]; 
            if (!targetPanel.className.includes('panel-body')) {
                targetPanel = targetPanel.closest('.panel-body') || targetPanel.parentElement;
            }

            const sourceEls = Array.from(document.querySelectorAll('div')).filter(el => 
                !el.closest('#ordersSection') && 
                el.textContent.includes('GỢI Ý ĐẶT GIÁ') && 
                el.textContent.includes('Biên lợi nhuận')
            );
            
            if (sourceEls.length > 0) {
                let srcPanel = sourceEls[sourceEls.length - 1];
                if (!srcPanel.className.includes('panel-body') && srcPanel.closest('.panel-body')) {
                    srcPanel = srcPanel.closest('.panel-body'); 
                } else if (!srcPanel.className.includes('panel-body')) {
                    srcPanel = srcPanel.parentElement;
                }

                let newHtml = srcPanel.innerHTML;
                newHtml = newHtml.replace(/id="([^"]+)"/g, 'id="$1_orders_clone"'); 
                
                if (targetPanel.innerHTML !== newHtml) {
                    targetPanel.innerHTML = newHtml;
                }
            }
        } catch (e) {}
    }, 1000);

    // --- HỆ THỐNG FORMAT SỐ DƯ KZT CÓ DẤU PHẨY ---
    function formatKztInput(el) {
        if (!el || !el.value) return;
        // Bỏ hết ký tự không phải số và dấu chấm
        let rawVal = el.value.replace(/,/g, '').replace(/[^0-9.]/g, '');
        if (!rawVal || isNaN(rawVal)) return;
        
        // Chia phần nguyên và phần thập phân (nếu có)
        let parts = rawVal.split('.');
        parts[0] = parseInt(parts[0]).toLocaleString('en-US'); // Thêm dấu phẩy
        el.value = parts.join('.');
    }

    const bFree = document.getElementById('bankFreedom');
    if(bFree) {
        bFree.addEventListener('input', function() { this.value = this.value.replace(/[^0-9.,]/g, ''); });
        bFree.addEventListener('blur', function() { formatKztInput(this); });
        // Format ngay lúc load
        formatKztInput(bFree);
    }
    const bBCC = document.getElementById('bankBCC');
    if(bBCC) {
        bBCC.addEventListener('input', function() { this.value = this.value.replace(/[^0-9.,]/g, ''); });
        bBCC.addEventListener('blur', function() { formatKztInput(this); });
        // Format ngay lúc load
        formatKztInput(bBCC);
    }

    if(document.getElementById('btnRefreshUsdt')) document.getElementById('btnRefreshUsdt').addEventListener('click', window.loadUsdtBalance);

    window.triggerOrdersLoad = function() {
        if(isOrdersTab) {
            const curPendingPage = window.currentPendingPage || 1;
            const curOldPage = window.currentOldPage || 1;
            // silent = true: không xóa bảng, chỉ swap data khi có
            if(window.loadPendingOrders) window.loadPendingOrders(curPendingPage, true);
            if(window.loadOldOrders) window.loadOldOrders(curOldPage, true);
            if(window.loadUsdtBalance) window.loadUsdtBalance();
            if(window.fetchMyAdsBackground) window.fetchMyAdsBackground();
        }
    };

    setInterval(() => {
        const confArea = document.getElementById('configArea');
        if(confArea && confArea.classList.contains('locked-overlay')) {
            window.triggerOrdersLoad();
        }
    }, 25000);

    setTimeout(() => { 
        const confArea = document.getElementById('configArea');
        if(confArea && confArea.classList.contains('locked-overlay')) {
            window.triggerOrdersLoad();
        }
    }, 1000); 
});