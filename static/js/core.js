window.isAdsTab = window.location.pathname.includes('/ads');
window.isOrdersTab = window.location.pathname.includes('/orders');
window.selectedAccountIndex = null;
window.selectedAccountName = '';
window.currentGroup = '';
window.currentSide = "1"; 
window.allBuyAdsData = [];  
window.allSellAdsData = []; 
window.filteredBuyAds = [];
window.filteredSellAds = [];
window.currentPage = 1;
window.itemsPerPage = 10;
window.autoRefreshInterval = null;

// === Auto redirect khi session hết hạn ===
(function() {
    const _origFetch = window.fetch;
    window.fetch = function(...args) {
        return _origFetch.apply(this, args).then(res => {
            if (res.status === 401) {
                // Session hết hạn -> về login
                window.location.href = '/login';
                return Promise.reject(new Error('Session expired'));
            }
            return res;
        });
    };
})();

window.showToast = function(message, type = 'success') {
    const toastEl = document.getElementById('liveToast');
    if(!toastEl) return;
    const toastBody = document.getElementById('toastMessage');
    toastBody.textContent = message;
    toastEl.className = `toast align-items-center text-white border-0 bg-${type}`;
    const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
    toast.show();
};

window.restoreOriginalConfig = function() {
    try {
        if (typeof SERVER_CONFIG !== 'undefined') {
            if (SERVER_CONFIG.proxy) {
                if(document.getElementById('proxyIp')) document.getElementById('proxyIp').value = SERVER_CONFIG.proxy.ip || '';
                if(document.getElementById('proxyPort')) document.getElementById('proxyPort').value = SERVER_CONFIG.proxy.port || '';
                if(document.getElementById('proxyUser')) document.getElementById('proxyUser').value = SERVER_CONFIG.proxy.user || '';
                if(document.getElementById('proxyPass')) document.getElementById('proxyPass').value = SERVER_CONFIG.proxy.pass || '';
            }
            if (SERVER_CONFIG.filters) {
                if(document.getElementById('filterDeltaX')) document.getElementById('filterDeltaX').value = SERVER_CONFIG.filters.deltaX || '';
                if(document.getElementById('filterLimitY')) document.getElementById('filterLimitY').value = SERVER_CONFIG.filters.limitY || '';
                if(document.getElementById('filterLimitMax')) document.getElementById('filterLimitMax').value = SERVER_CONFIG.filters.limitMax || '';
                if(document.getElementById('filterPayment')) document.getElementById('filterPayment').value = SERVER_CONFIG.filters.payment || '';
                if(document.getElementById('filterMargin')) document.getElementById('filterMargin').value = SERVER_CONFIG.filters.margin || '';
                if(document.getElementById('autoRefreshSelect')) document.getElementById('autoRefreshSelect').value = SERVER_CONFIG.filters.autoRefresh || '0';
            }
            if (SERVER_CONFIG.bankBalances) {
                if(document.getElementById('bankFreedom')) document.getElementById('bankFreedom').value = SERVER_CONFIG.bankBalances.freedom || '';
                if(document.getElementById('bankBCC')) document.getElementById('bankBCC').value = SERVER_CONFIG.bankBalances.bcc || '';
            }
            if(document.getElementById('openaiKey')) {
                document.getElementById('openaiKey').value = SERVER_CONFIG.openai_key || '';
            }
            if(document.getElementById('teleBotToken')) {
                document.getElementById('teleBotToken').value = SERVER_CONFIG.tele_bot_token || '';
            }
            if(document.getElementById('teleChatId')) {
                document.getElementById('teleChatId').value = SERVER_CONFIG.tele_chat_id || '';
            }
        }
        lockUI(selectedAccountName);
    } catch(e) { console.error("Lỗi restore config:", e); }
};

window.lockUI = function(accName) {
    try {
        if(document.getElementById('configArea')) document.getElementById('configArea').classList.add('locked-overlay');
        const actionBtn = document.getElementById('actionBtn');
        if(actionBtn) {
            actionBtn.innerHTML = '<i class="fas fa-lock-open"></i> MỞ KHÓA';
            actionBtn.className = 'btn btn-outline-danger fw-bold';
            actionBtn.style.fontSize = '13px';
            actionBtn.style.padding = '8px 16px';
            actionBtn.style.height = '36px';
            actionBtn.style.lineHeight = '1';
        }
        
        const cancelBtn = document.getElementById('cancelConfigBtn');
        if(cancelBtn) cancelBtn.classList.add('d-none');

        if(document.getElementById('proxyEditMode')) document.getElementById('proxyEditMode').classList.add('d-none');
        if(document.getElementById('proxyViewMode')) document.getElementById('proxyViewMode').classList.remove('d-none');
        if(document.getElementById('proxyDisplayText') && document.getElementById('proxyIp')) document.getElementById('proxyDisplayText').textContent = document.getElementById('proxyIp').value;
        
        if(document.getElementById('openaiEditMode')) document.getElementById('openaiEditMode').classList.add('d-none');
        if(document.getElementById('openaiViewMode')) document.getElementById('openaiViewMode').classList.remove('d-none');

        if(document.getElementById('teleEditMode')) document.getElementById('teleEditMode').classList.add('d-none');
        if(document.getElementById('teleViewMode')) document.getElementById('teleViewMode').classList.remove('d-none');
        
        if(document.getElementById('accountSelectionRow')) document.getElementById('accountSelectionRow').classList.add('d-none');
        if(document.getElementById('lockedAccountDisplay')) document.getElementById('lockedAccountDisplay').classList.remove('d-none');
        if(document.getElementById('lockedAccountName')) document.getElementById('lockedAccountName').innerHTML = `<i class="fas fa-user-circle text-primary"></i> ${accName}`;
        
        if(document.getElementById('bankFreedom')) document.getElementById('bankFreedom').disabled = true;
        if(document.getElementById('bankBCC')) document.getElementById('bankBCC').disabled = true;
        if(document.getElementById('btnEditBank')) document.getElementById('btnEditBank').classList.remove('d-none');
        if(document.getElementById('btnSaveBank')) document.getElementById('btnSaveBank').classList.add('d-none');

        if (isAdsTab) {
            if(document.getElementById('postAdSection')) document.getElementById('postAdSection').classList.remove('d-none');
            if(document.getElementById('p2pMarketSection')) document.getElementById('p2pMarketSection').classList.add('d-none');
            if(document.getElementById('ordersSection')) document.getElementById('ordersSection').classList.add('d-none');
        } else if (isOrdersTab) {
            if(document.getElementById('ordersSection')) document.getElementById('ordersSection').classList.remove('d-none');
            if(document.getElementById('postAdSection')) document.getElementById('postAdSection').classList.add('d-none');
            if(document.getElementById('p2pMarketSection')) document.getElementById('p2pMarketSection').classList.add('d-none');
        } else {
            if(document.getElementById('p2pMarketSection')) document.getElementById('p2pMarketSection').classList.remove('d-none');
            if(document.getElementById('postAdSection')) document.getElementById('postAdSection').classList.add('d-none');
            if(document.getElementById('ordersSection')) document.getElementById('ordersSection').classList.add('d-none');
        }
    } catch(e) { console.error("Lỗi lockUI:", e); }
};

window.unlockUI = function() {
    try {
        if(document.getElementById('configArea')) document.getElementById('configArea').classList.remove('locked-overlay');
        const actionBtn = document.getElementById('actionBtn');
        if(actionBtn) {
            actionBtn.textContent = 'LƯU CẤU HÌNH';
            actionBtn.className = 'btn btn-success fw-bold';
            actionBtn.style.fontSize = '13px';
            actionBtn.style.padding = '8px 16px';
            actionBtn.style.height = '36px';
            actionBtn.style.lineHeight = '1';
        }
        
        const cancelBtn = document.getElementById('cancelConfigBtn');
        if(cancelBtn) cancelBtn.classList.remove('d-none');

        if(document.getElementById('proxyEditMode')) document.getElementById('proxyEditMode').classList.remove('d-none');
        if(document.getElementById('proxyViewMode')) document.getElementById('proxyViewMode').classList.add('d-none');
        
        if(document.getElementById('openaiEditMode')) document.getElementById('openaiEditMode').classList.remove('d-none');
        if(document.getElementById('openaiViewMode')) document.getElementById('openaiViewMode').classList.add('d-none');

        if(document.getElementById('teleEditMode')) document.getElementById('teleEditMode').classList.remove('d-none');
        if(document.getElementById('teleViewMode')) document.getElementById('teleViewMode').classList.add('d-none');

        if(document.getElementById('accountSelectionRow')) document.getElementById('accountSelectionRow').classList.remove('d-none');
        if(document.getElementById('lockedAccountDisplay')) document.getElementById('lockedAccountDisplay').classList.add('d-none');
        
        if(document.getElementById('bankFreedom')) document.getElementById('bankFreedom').disabled = false;
        if(document.getElementById('bankBCC')) document.getElementById('bankBCC').disabled = false;
        if(document.getElementById('btnEditBank')) document.getElementById('btnEditBank').classList.add('d-none');
        if(document.getElementById('btnSaveBank')) document.getElementById('btnSaveBank').classList.remove('d-none');

        if(document.getElementById('p2pMarketSection')) document.getElementById('p2pMarketSection').classList.add('d-none');
        if(document.getElementById('postAdSection')) document.getElementById('postAdSection').classList.add('d-none');
        if(document.getElementById('ordersSection')) document.getElementById('ordersSection').classList.add('d-none');
        
        clearInterval(autoRefreshInterval);
    } catch(e) { console.error("Lỗi unlockUI:", e); }
};

window.getFullConfigState = function(isLockedState) {
    let pendingIds = [], processedIds = [];
    if(typeof SERVER_CONFIG !== 'undefined' && SERVER_CONFIG.bankBalances) {
        pendingIds = SERVER_CONFIG.bankBalances.pendingKztIds || [];
        processedIds = SERVER_CONFIG.bankBalances.processedKztIds || [];
    }
    
    return {
        group: currentGroup,
        account_index: selectedAccountIndex,
        account_name: selectedAccountName,
        is_locked: isLockedState, 
        openai_key: (document.getElementById('openaiKey') && document.getElementById('openaiKey').value.trim() !== "") 
            ? document.getElementById('openaiKey').value.trim() 
            : (typeof SERVER_CONFIG !== 'undefined' && SERVER_CONFIG.openai_key ? SERVER_CONFIG.openai_key : ""),
        tele_bot_token: document.getElementById('teleBotToken') ? document.getElementById('teleBotToken').value.trim() : "",
        tele_chat_id: document.getElementById('teleChatId') ? document.getElementById('teleChatId').value.trim() : "",
        proxy: {
            ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "",
            port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "",
            user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "",
            pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : ""
        },
        filters: {
            deltaX: document.getElementById('filterDeltaX') ? document.getElementById('filterDeltaX').value.trim() : "",
            limitY: document.getElementById('filterLimitY') ? document.getElementById('filterLimitY').value.trim() : "",
            limitMax: document.getElementById('filterLimitMax') ? document.getElementById('filterLimitMax').value.trim() : "",
            payment: document.getElementById('filterPayment') ? document.getElementById('filterPayment').value.trim() : "",
            margin: document.getElementById('filterMargin') ? document.getElementById('filterMargin').value.trim() : "",
            autoRefresh: document.getElementById('autoRefreshSelect') ? document.getElementById('autoRefreshSelect').value : "0"
        },
        bankBalances: {
            freedom: document.getElementById('bankFreedom') ? document.getElementById('bankFreedom').value.trim() : "",
            bcc: document.getElementById('bankBCC') ? document.getElementById('bankBCC').value.trim() : "",
            pendingKztIds: pendingIds,
            processedKztIds: processedIds
        }
    };
};

document.addEventListener('DOMContentLoaded', () => {
    try {
        const cancelBtn = document.getElementById('cancelConfigBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                window.restoreOriginalConfig();
            });
        }

        if (isAdsTab) {
            if(document.getElementById('navAds')) document.getElementById('navAds').classList.add('active');
            if(document.getElementById('navMarket')) document.getElementById('navMarket').classList.remove('active');
            if(document.getElementById('navOrders')) document.getElementById('navOrders').classList.remove('active');
        } else if (isOrdersTab) {
            if(document.getElementById('navOrders')) document.getElementById('navOrders').classList.add('active');
            if(document.getElementById('navMarket')) document.getElementById('navMarket').classList.remove('active');
            if(document.getElementById('navAds')) document.getElementById('navAds').classList.remove('active');
        } else {
            if(document.getElementById('navMarket')) document.getElementById('navMarket').classList.add('active');
            if(document.getElementById('navAds')) document.getElementById('navAds').classList.remove('active');
            if(document.getElementById('navOrders')) document.getElementById('navOrders').classList.remove('active');
        }

        if (typeof SERVER_CONFIG !== 'undefined') {
            if (SERVER_CONFIG.proxy) {
                if(document.getElementById('proxyIp')) document.getElementById('proxyIp').value = SERVER_CONFIG.proxy.ip || '';
                if(document.getElementById('proxyPort')) document.getElementById('proxyPort').value = SERVER_CONFIG.proxy.port || '';
                if(document.getElementById('proxyUser')) document.getElementById('proxyUser').value = SERVER_CONFIG.proxy.user || '';
                if(document.getElementById('proxyPass')) document.getElementById('proxyPass').value = SERVER_CONFIG.proxy.pass || '';
            }
            if (SERVER_CONFIG.filters) {
                if(document.getElementById('filterDeltaX')) document.getElementById('filterDeltaX').value = SERVER_CONFIG.filters.deltaX || '';
                if(document.getElementById('filterLimitY')) document.getElementById('filterLimitY').value = SERVER_CONFIG.filters.limitY || '';
                if(document.getElementById('filterLimitMax')) document.getElementById('filterLimitMax').value = SERVER_CONFIG.filters.limitMax || '';
                if(document.getElementById('filterPayment')) document.getElementById('filterPayment').value = SERVER_CONFIG.filters.payment || '';
                if(document.getElementById('filterMargin')) document.getElementById('filterMargin').value = SERVER_CONFIG.filters.margin || '';
                if(document.getElementById('autoRefreshSelect')) document.getElementById('autoRefreshSelect').value = SERVER_CONFIG.filters.autoRefresh || '0';
            }
            if (SERVER_CONFIG.bankBalances) {
                if(document.getElementById('bankFreedom')) document.getElementById('bankFreedom').value = SERVER_CONFIG.bankBalances.freedom || '';
                if(document.getElementById('bankBCC')) document.getElementById('bankBCC').value = SERVER_CONFIG.bankBalances.bcc || '';
            }
            if(document.getElementById('openaiKey')) {
                document.getElementById('openaiKey').value = SERVER_CONFIG.openai_key || '';
            }
            if(document.getElementById('teleBotToken')) {
                document.getElementById('teleBotToken').value = SERVER_CONFIG.tele_bot_token || '';
            }
            if(document.getElementById('teleChatId')) {
                document.getElementById('teleChatId').value = SERVER_CONFIG.tele_chat_id || '';
            }

            if (SERVER_CONFIG.group) {
                currentGroup = SERVER_CONFIG.group;
                if(document.getElementById('groupSelect')) {
                    if(!document.getElementById('groupSelect').querySelector(`option[value="${currentGroup}"]`)) {
                        document.getElementById('groupSelect').innerHTML += `<option value="${currentGroup}">${currentGroup}</option>`;
                    }
                    document.getElementById('groupSelect').value = currentGroup;
                }
                selectedAccountIndex = SERVER_CONFIG.account_index;
                selectedAccountName = SERVER_CONFIG.account_name || 'Đã Chọn';
            }
        }
    } catch(e) { console.error("Lỗi core DOMContentLoaded:", e); }
});

