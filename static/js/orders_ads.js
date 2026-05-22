let currentAddingAd = null;
let addUsdtModal = null;

// --- QUẢN LÝ LƯU TRỮ TRẠNG THÁI NÚT AUTO TĂNG U ---
window.getAutoAddUsdtAds = function() {
    try { return new Set(JSON.parse(localStorage.getItem('autoAddUsdtAds') || '[]')); } 
    catch(e) { return new Set(); }
};
window.setAutoAddUsdtAds = function(setObj) {
    localStorage.setItem('autoAddUsdtAds', JSON.stringify(Array.from(setObj)));
    window.autoAddUsdtAds = setObj;
};
window.autoAddUsdtAds = window.getAutoAddUsdtAds();

// --- HÀM XỬ LÝ CHUNG: BỔ SUNG USDT VÀO QUẢNG CÁO ---
window.doAddUsdtToAd = async function(adObj, addAmount) {
    const proxyConfig = {
        ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "",
        port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "",
        user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "",
        pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : ""
    };

    try {
        const resInfo = await fetch('/api/ad_info', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, itemId: adObj.id })
        });
        const infoData = await resInfo.json();
        if (infoData.status !== 'success') return {success: false, message: infoData.message};
        const adDetails = infoData.data;

        const resPay = await fetch('/api/payments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig })
        });
        const payData = await resPay.json();

        let validPaymentIds = [];
        if (payData.status === 'success' && Array.isArray(payData.data)) {
            const userPayments = payData.data;
            if (adDetails.paymentTerms && adDetails.paymentTerms.length > 0) {
                adDetails.paymentTerms.forEach(pt => { if (pt.id && pt.id !== "-1" && userPayments.find(up => up.id == pt.id)) validPaymentIds.push(pt.id.toString()); });
            }
            if (validPaymentIds.length === 0) {
                (adDetails.payments || []).forEach(pType => {
                    const match = userPayments.find(p => p.paymentType == pType);
                    if (match) validPaymentIds.push(match.id.toString());
                });
            }
        }
        validPaymentIds = [...new Set(validPaymentIds)].slice(0, 5);
        if(validPaymentIds.length === 0) return {success: false, message: "Không tìm thấy PTTT hợp lệ"};

        const pref = adDetails.tradingPreferenceSet || {};
        const buildPref = {
            hasUnPostAd: (pref.hasUnPostAd || 0).toString(), isKyc: (pref.isKyc || 0).toString(),
            isEmail: (pref.isEmail || 0).toString(), isMobile: (pref.isMobile || 0).toString(),
            hasRegisterTime: (pref.hasRegisterTime || 0).toString(), registerTimeThreshold: (pref.registerTimeThreshold || 0).toString(),
            hasOrderFinishNumberDay30: (pref.hasOrderFinishNumberDay30 || 0).toString(), orderFinishNumberDay30: (pref.orderFinishNumberDay30 || 0).toString(),
            hasCompleteRateDay30: (pref.hasCompleteRateDay30 || 0).toString(), completeRateDay30: (pref.completeRateDay30 || 0).toString(),
            hasNationalLimit: (pref.hasNationalLimit || 0).toString(), nationalLimit: pref.nationalLimit || ""
        };

        const currentLeft = parseFloat(adDetails.lastQuantity || 0);
        const newQuantity = currentLeft + addAmount;

        const modifyPayload = {
            id: adDetails.id.toString(),
            priceType: adDetails.priceType.toString(),
            premium: adDetails.premium ? adDetails.premium.toString() : "0",
            price: adDetails.price.toString(),
            minAmount: adDetails.minAmount.toString(),
            maxAmount: adDetails.maxAmount.toString(),
            remark: adDetails.remark || "",
            tradingPreferenceSet: buildPref,
            paymentIds: validPaymentIds,
            actionType: "MODIFY",
            quantity: newQuantity.toFixed(2), 
            paymentPeriod: adDetails.paymentPeriod ? adDetails.paymentPeriod.toString() : "15"
        };

        const resUpdate = await fetch('/api/relist_ad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                group: currentGroup,
                account_index: selectedAccountIndex,
                proxy: proxyConfig,
                payload: modifyPayload
            })
        });
        const data = await resUpdate.json();
        
        if(data.status === 'success') {
            return {success: true};
        } else {
            return {success: false, message: data.message};
        }
    } catch(e) {
        return {success: false, message: e.message};
    }
};

window.renderOnlineAds = function() {
    const tbody = document.getElementById('onlineAdsBodyOrdersTab');
    if(!tbody) return;
    
    const onlineAds = window.myPersonalAds_OrdersTab.filter(ad => parseInt(ad.status) === 10);
    
    // SẮP XẾP: MUA -> BÁN, Mốc 1 -> 2 -> 3
    onlineAds.sort((a, b) => {
        if (a.side !== b.side) return a.side - b.side; 
        let tierA = parseInt(typeof window.getAdTier === 'function' ? window.getAdTier(a.id) : (localStorage.getItem('ad_tier_' + a.id) || "1"));
        let tierB = parseInt(typeof window.getAdTier === 'function' ? window.getAdTier(b.id) : (localStorage.getItem('ad_tier_' + b.id) || "1"));
        return tierA - tierB;
    });

    window.autoUpdateAds = window.getAutoUpdateAds();
    window.autoAddUsdtAds = window.getAutoAddUsdtAds();

    if(onlineAds.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Không có quảng cáo nào đang Online</td></tr>';
        if(document.getElementById('timeRefreshOnlineAds')) document.getElementById('timeRefreshOnlineAds').innerText = window.getTimestampStr();
        return;
    }

    tbody.innerHTML = '';
    onlineAds.forEach(ad => {
        const updateDateStr = ad.updateDate ? (new Date(parseInt(ad.updateDate)).toLocaleTimeString('vi-VN') + ' ' + new Date(parseInt(ad.updateDate)).toLocaleDateString('vi-VN')) : '--';
        const sideHtml = ad.side === 0 ? '<span class="badge bg-success" style="font-size: 12.5px; padding: 5px 8px;">MUA</span>' : '<span class="badge bg-danger" style="font-size: 12.5px; padding: 5px 8px;">BÁN</span>';

        let paymentNames = (ad.payments || []).map(pId => { return (typeof PAYMENT_METHODS !== 'undefined' && PAYMENT_METHODS[pId]) ? PAYMENT_METHODS[pId] : `Bank (${pId})`; }).join(', ');

        let actionHtml = `
            <div class="btn-group">
                <button class="btn btn-sm btn-outline-success btn-add-u-ext fw-bold" data-id="${ad.id}" title="Tăng USDT" style="font-size: 13px; padding: 5px 10px;"><i class="fas fa-plus"></i> Tăng U</button>
                <button class="btn btn-sm btn-outline-primary btn-edit-ad-ext fw-bold" data-id="${ad.id}" title="Sửa Quảng Cáo" style="font-size: 13px; padding: 5px 10px;"><i class="fas fa-edit"></i> Sửa</button>
                <button class="btn btn-sm btn-outline-danger btn-offline-ad-ext fw-bold" data-id="${ad.id}" title="Tắt Quảng Cáo" style="font-size: 13px; padding: 5px 10px;"><i class="fas fa-power-off"></i> Tắt</button>
            </div>
        `;

        let isChecked = window.autoUpdateAds.has(ad.id.toString());
        let isUChecked = window.autoAddUsdtAds.has(ad.id.toString());
        let assignedTier = "1";
        if (typeof window.getAdTier === 'function') {
            assignedTier = window.getAdTier(ad.id);
        } else {
            assignedTier = localStorage.getItem('ad_tier_' + ad.id) || "1";
        }
        
        // CỘT TRẠNG THÁI: Tách Trái (Online/Mốc) - Phải (Các Switch Auto)
        let autoHtml = `
            <div class="d-flex align-items-center justify-content-center gap-3">
                <div class="d-flex flex-column align-items-center">
                    <div class="mb-2"><span class="badge bg-success" style="font-size: 12px; padding: 5px 8px;">Online</span></div>
                    <div><span class="badge bg-light text-primary border border-primary" style="font-size: 12px; padding: 4px 8px;">Mốc ${assignedTier}</span></div>
                </div>
                <div class="d-flex flex-column align-items-start">
                    <div class="form-check form-switch mb-2 d-flex align-items-center p-0">
                        <input class="form-check-input auto-price-switch-ext m-0" type="checkbox" id="auto_ord_${ad.id}" data-id="${ad.id}" style="float:none; width: 32px; height: 18px;" ${isChecked ? 'checked' : ''}>
                        <label class="form-check-label text-secondary ms-2 fw-bold" style="font-size:12px; cursor: pointer;" for="auto_ord_${ad.id}">Auto sửa giá</label>
                    </div>
                    <div class="form-check form-switch m-0 d-flex align-items-center p-0">
                        <input class="form-check-input auto-u-switch-ext m-0" type="checkbox" id="auto_u_${ad.id}" data-id="${ad.id}" style="float:none; width: 32px; height: 18px;" ${isUChecked ? 'checked' : ''}>
                        <label class="form-check-label text-secondary ms-2 fw-bold" style="font-size:12px; cursor: pointer;" for="auto_u_${ad.id}">Auto tăng U</label>
                    </div>
                </div>
            </div>
        `;

        let priceFloat = parseFloat(ad.price);
        let minFiat = parseFloat(ad.minAmount);
        let maxFiat = parseFloat(ad.maxAmount);
        let minUsdt = priceFloat > 0 ? (minFiat / priceFloat).toFixed(2) : 0;
        let maxUsdt = priceFloat > 0 ? (maxFiat / priceFloat).toFixed(2) : 0;
        let frozen = ad.frozenQuantity ? parseFloat(ad.frozenQuantity) : 0;
        let displayQty = parseFloat(ad.lastQuantity || 0);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="align-middle py-2">
                <div class="fw-bold text-dark" style="font-size: 14.5px;">${ad.id}</div>
                <div class="text-secondary mt-1" style="font-size: 12px;"><i class="fas fa-sync"></i> ${updateDateStr}</div>
            </td>
            <td class="align-middle py-2 text-center">
                <div class="mb-1">${sideHtml}</div>
                <div class="fw-bold text-secondary" style="font-size: 13px;">${ad.tokenId}/${ad.currencyId}</div>
            </td>
            <td class="align-middle py-2">
                <div class="price-text text-dark fw-bold" id="ad_price_ord_${ad.id}" style="font-size: 17px;">${priceFloat.toLocaleString()}</div>
                <div class="mt-1" style="font-size: 12.5px; color: #848e9c; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${paymentNames}">${paymentNames}</div>
            </td>
            <td class="align-middle py-2">
                <div class="fw-bold text-dark" style="font-size: 15.5px;">${displayQty.toLocaleString()} USDT ${frozen > 0 ? `<span class="text-danger fw-normal ms-1" style="font-size: 12.5px;">(${frozen.toLocaleString()} khóa)</span>` : ''}</div>
                <div class="text-secondary mt-1" style="font-size: 13.5px;">
                    ${minFiat.toLocaleString()} - ${maxFiat.toLocaleString()} ${ad.currencyId} 
                    <span class="text-primary ms-1" style="font-size: 12.5px;">(~ ${parseFloat(minUsdt).toLocaleString()} - ${parseFloat(maxUsdt).toLocaleString()} $)</span>
                </div>
            </td>
            <td class="align-middle py-2">${autoHtml}</td>
            <td class="align-middle text-end py-2">${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    if(document.getElementById('timeRefreshOnlineAds')) document.getElementById('timeRefreshOnlineAds').innerText = window.getTimestampStr();

    tbody.querySelectorAll('.btn-offline-ad-ext').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const itemId = e.currentTarget.dataset.id;
            e.currentTarget.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            e.currentTarget.disabled = true;
            try {
                const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
                const res = await fetch('/api/cancel_ad', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, itemId: itemId, item_id: itemId, payload: { itemId: itemId } })
                });
                const d = await res.json();
                if(d.status === 'success') {
                    showToast(`Đã tắt quảng cáo ${itemId}`, 'success');
                    let currentSet = window.getAutoUpdateAds();
                    currentSet.delete(itemId.toString());
                    window.setAutoUpdateAds(currentSet);
                    
                    let currentUSet = window.getAutoAddUsdtAds();
                    currentUSet.delete(itemId.toString());
                    window.setAutoAddUsdtAds(currentUSet);
                    
                    window.fetchMyAdsBackground(); 
                } else { showToast(`Lỗi tắt QC: ${d.message}`, 'danger'); }
            } catch(err) { showToast('Lỗi kết nối', 'danger'); }
        });
    });

    tbody.querySelectorAll('.btn-edit-ad-ext').forEach(btn => {
        btn.addEventListener('click', () => {
            showToast('Vui lòng sang tab QUẢNG CÁO để chỉnh sửa thông số!', 'info');
        });
    });

    tbody.querySelectorAll('.auto-price-switch-ext').forEach(sw => {
        sw.addEventListener('change', (e) => {
            const adIdStr = e.target.dataset.id.toString();
            let currentSet = window.getAutoUpdateAds();
            if(e.target.checked) {
                currentSet.add(adIdStr);
                showToast(`BẬT Auto cập nhật giá cho QC ${adIdStr}`, 'success');
            } else {
                currentSet.delete(adIdStr);
                showToast(`TẮT Auto cập nhật giá cho QC ${adIdStr}`, 'info');
            }
            window.setAutoUpdateAds(currentSet);
            const mainTabSwitch = document.getElementById(`auto_${adIdStr}`);
            if(mainTabSwitch) mainTabSwitch.checked = e.target.checked;
        });
    });

    // Bắt sự kiện bật tắt Auto Tăng U
    tbody.querySelectorAll('.auto-u-switch-ext').forEach(sw => {
        sw.addEventListener('change', (e) => {
            const adIdStr = e.target.dataset.id.toString();
            let currentSet = window.getAutoAddUsdtAds();
            if(e.target.checked) {
                currentSet.add(adIdStr);
                showToast(`BẬT Auto tăng USDT max cho QC ${adIdStr}`, 'success');
            } else {
                currentSet.delete(adIdStr);
                showToast(`TẮT Auto tăng USDT max cho QC ${adIdStr}`, 'info');
            }
            window.setAutoAddUsdtAds(currentSet);
        });
    });
};

window.fetchMyAdsBackground = async function() {
    const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
    try {
        const response = await fetch('/api/my_ads', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { tokenId: "USDT", currencyId: "KZT" } })
        });
        const data = await response.json();
        if (data.status === 'success') {
            const items = data.data.items || [];
            window.myPersonalAds_OrdersTab = items;
        }
        if(isOrdersTab) window.renderOnlineAds();
    } catch(e) { console.error("Lỗi lấy QC của tôi", e); }
};

// --- TIẾN TRÌNH NGẦM (BACKGROUND) AUTO TĂNG U MỖI 20 GIÂY ---
if(!window.autoAddUInterval) {
    window.autoAddUInterval = setInterval(async () => {
        if(!window.autoAddUsdtAds || window.autoAddUsdtAds.size === 0) return;

        // Số dư USDT Funding (cho QC BÁN)
        const fundAvailText = document.getElementById('balFundAvail') ? document.getElementById('balFundAvail').innerText.replace(/,/g, '') : "0";
        const fundAvail = parseFloat(fundAvailText) || 0;

        // Số dư KZT Freedom (cho QC MUA)
        const getKztFreedom = () => {
            const el = document.getElementById('bankFreedom');
            if (el && el.value) {
                const v = parseFloat(el.value.toString().replace(/,/g, '').replace(/\s/g, ''));
                if (!isNaN(v) && v > 0) return v;
            }
            if (typeof SERVER_CONFIG !== 'undefined' && SERVER_CONFIG.bankBalances && SERVER_CONFIG.bankBalances.freedom) {
                const raw = SERVER_CONFIG.bankBalances.freedom.toString().replace(/,/g, '').replace(/\s/g, '');
                const v = parseFloat(raw);
                if (!isNaN(v) && v > 0) return v;
            }
            return 0;
        };
        const kztFreedom = getKztFreedom();

        for(let adId of window.autoAddUsdtAds) {
            const ad = (window.myPersonalAds_OrdersTab || []).find(a => a.id === adId && parseInt(a.status) === 10);
            if(!ad) continue;

            const currentQty = parseFloat(ad.lastQuantity || 0);
            const price = parseFloat(ad.price || 0);
            let maxAddable = 0;
            let targetQty = 0;
            let logTag = '';

            if (ad.side === 1) {
                // QC BÁN: dựa vào USDT Funding
                targetQty = fundAvail; // toàn bộ funding -> quantity QC
                maxAddable = fundAvail - currentQty;
                logTag = 'BÁN';
            } else {
                // QC MUA: dựa vào KZT Freedom / giá
                if (price <= 0 || kztFreedom <= 0) continue;
                targetQty = Math.floor((kztFreedom / price) * 100) / 100; // 2 chữ số thập phân, làm tròn xuống
                maxAddable = targetQty - currentQty;
                logTag = 'MUA';
            }

            // Chỉ tăng khi chênh lệch ≥ 5 USDT (tránh nạp lắt nhắt)
            if (maxAddable >= 5) {
                let safeAdd = maxAddable - 0.01;
                if (safeAdd < 0) safeAdd = 0;

                const res = await window.doAddUsdtToAd(ad, safeAdd);
                if (res.success) {
                    showToast(`Hệ thống tự động nạp ${safeAdd.toFixed(2)} USDT cho QC ${logTag} ${ad.id}`, 'success');
                    if (window.loadUsdtBalance) window.loadUsdtBalance();
                    if (window.fetchMyAdsBackground) window.fetchMyAdsBackground();
                } else {
                    console.error(`Auto add U failed (${logTag} ${ad.id}): ${res.message}`);
                }
            }
        }
    }, 20000);
}
document.addEventListener('DOMContentLoaded', () => {
    if (!isOrdersTab) return;

    if(document.getElementById('addUsdtModal')) {
        addUsdtModal = new bootstrap.Modal(document.getElementById('addUsdtModal'), { backdrop: 'static' });
    }

    // ==========================================================
    // === SWITCH HOẠT ĐỘNG / NGHỈ (thay nút Tắt tất cả QC) =====
    // ==========================================================

    // Helper: tắt tất cả QC online SONG SONG
    window.turnOffAllOnlineAds = async function(onProgress) {
        const onlineAds = (window.myPersonalAds_OrdersTab || []).filter(ad => parseInt(ad.status) === 10);
        if (onlineAds.length === 0) return { total: 0, success: 0 };

        const proxyConfig = {
            ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "",
            port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "",
            user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "",
            pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : ""
        };

        let done = 0;
        const cancelOne = async (ad) => {
            try {
                const res = await fetch('/api/cancel_ad', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig,
                        itemId: ad.id, item_id: ad.id, payload: { itemId: ad.id }
                    })
                });
                const d = await res.json();
                done++;
                if (typeof onProgress === 'function') onProgress(done, onlineAds.length, ad.id);
                if (d.status === 'success') {
                    let s1 = window.getAutoUpdateAds(); s1.delete(ad.id.toString()); window.setAutoUpdateAds(s1);
                    let s2 = window.getAutoAddUsdtAds(); s2.delete(ad.id.toString()); window.setAutoAddUsdtAds(s2);
                    return true;
                }
                return false;
            } catch(e) {
                done++;
                if (typeof onProgress === 'function') onProgress(done, onlineAds.length, ad.id);
                return false;
            }
        };

        // Chạy SONG SONG tất cả request hủy
        const results = await Promise.all(onlineAds.map(cancelOne));
        const successCount = results.filter(x => x).length;
        return { total: onlineAds.length, success: successCount };
    };

    // === Overlay loading dùng chung ===
    function _showStatusOverlay(text) {
        let ov = document.getElementById('opStatusOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'opStatusOverlay';
            ov.innerHTML = `
                <div class="ops-box">
                    <div class="ops-spinner"><i class="fas fa-spinner fa-spin"></i></div>
                    <div class="ops-text" id="opStatusText">Đang xử lý...</div>
                    <div class="ops-sub" id="opStatusSub"></div>
                </div>`;
            document.body.appendChild(ov);
            const st = document.createElement('style');
            st.innerHTML = `
                #opStatusOverlay { position: fixed; inset: 0; background: rgba(15,23,42,.55); backdrop-filter: blur(3px); z-index: 999999; display: flex; align-items: center; justify-content: center; }
                #opStatusOverlay .ops-box { background: #fff; border-radius: 16px; padding: 32px 44px; min-width: 360px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
                #opStatusOverlay .ops-spinner { font-size: 38px; color: #2563eb; margin-bottom: 14px; }
                #opStatusOverlay .ops-text { font-size: 17px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
                #opStatusOverlay .ops-sub { font-size: 13px; color: #64748b; min-height: 18px; white-space: pre-line; }
                #opStatusOverlay.ops-ok .ops-spinner { color: #16a34a; }
                #opStatusOverlay.ops-err .ops-spinner { color: #dc2626; }`;
            document.head.appendChild(st);
        }
        ov.classList.remove('ops-ok', 'ops-err');
        ov.querySelector('.ops-spinner').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        document.getElementById('opStatusText').innerText = text || 'Đang xử lý...';
        document.getElementById('opStatusSub').innerText = '';
        ov.style.display = 'flex';
    }
    function _updateStatusOverlay(text, sub) {
        if (text) document.getElementById('opStatusText').innerText = text;
        if (sub !== undefined) document.getElementById('opStatusSub').innerText = sub;
    }
    function _finishStatusOverlay(ok, title, sub, autoCloseMs = 2200) {
        const ov = document.getElementById('opStatusOverlay');
        if (!ov) return;
        ov.classList.remove('ops-ok', 'ops-err');
        ov.classList.add(ok ? 'ops-ok' : 'ops-err');
        ov.querySelector('.ops-spinner').innerHTML = ok ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
        document.getElementById('opStatusText').innerText = title;
        document.getElementById('opStatusSub').innerText = sub || '';
        if (autoCloseMs > 0) setTimeout(() => { ov.style.display = 'none'; }, autoCloseMs);
    }

        // === Hàm đăng QC độc lập (không phụ thuộc tab Quảng cáo) ===
    window.quickPostAdStandalone = async function(side, tier) {
        const proxyConfig = {
            ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "",
            port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "",
            user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "",
            pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : ""
        };

        try {
            // 1) Lấy giá Mốc từ DOM (các phần tử t1BuyP / t1SellP / .sync-... có thể tồn tại trên panel chung)
            const priceElId = side === "0" ? `t${tier}BuyP` : `t${tier}SellP`;
            const priceDOM = document.getElementById(priceElId) || document.querySelector(`.sync-${priceElId}`);
            if (!priceDOM || !priceDOM.innerText || priceDOM.innerText === "..." || priceDOM.innerText === "NaN") {
                return { ok: false, msg: `Chưa có giá Mốc ${tier} (${side==="0"?"Mua":"Bán"})` };
            }
            const priceFloat = parseFloat(priceDOM.innerText.replace(/,/g, '').trim());
            if (isNaN(priceFloat) || priceFloat <= 0) return { ok: false, msg: `Giá Mốc ${tier} không hợp lệ` };

            // 2) Lấy Min/Max USDT của Mốc
            const getNum = (id) => {
                const el = document.getElementById(id);
                if (!el) return 0;
                const v = parseFloat(el.value || el.placeholder || 0);
                return isNaN(v) ? 0 : v;
            };
            const tMin = getNum(`tier${tier}Min`);
            const tMax = getNum(`tier${tier}Max`);
            if (tMin <= 0 || tMax <= 0) return { ok: false, msg: `Chưa cấu hình Min/Max Mốc ${tier}` };
            const minAmount = (tMin * priceFloat).toFixed(2);
            const maxAmount = (tMax * priceFloat).toFixed(2);

            // 3) Lấy danh sách PTTT từ API và tìm Freedom
            const resPay = await fetch('/api/payments', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig })
            });
            const payData = await resPay.json();
            if (payData.status !== 'success' || !Array.isArray(payData.data)) {
                return { ok: false, msg: 'Không lấy được danh sách PTTT' };
            }
            const freedomPays = payData.data.filter(p => {
                const name = (p.paymentConfigVo ? p.paymentConfigVo.paymentName : '') ||
                             (typeof PAYMENT_METHODS !== 'undefined' ? (PAYMENT_METHODS[p.paymentType] || '') : '');
                return name.toLowerCase().includes('freedom');
            });
            if (freedomPays.length === 0) return { ok: false, msg: 'Không tìm thấy PTTT Freedom' };
            const paymentIds = freedomPays.slice(0, 5).map(p => p.id.toString());

            // 4) Tính quantity
            let quantity = "0";
            if (side === "0") {
                // MUA: KZT Freedom / giá
                let kzt = 0;
                const elBank = document.getElementById('bankFreedom');
                if (elBank && elBank.value) {
                    const v = parseFloat(elBank.value.toString().replace(/,/g, '').replace(/\s/g, ''));
                    if (!isNaN(v) && v > 0) kzt = v;
                }
                if (kzt === 0 && typeof SERVER_CONFIG !== 'undefined' && SERVER_CONFIG.bankBalances && SERVER_CONFIG.bankBalances.freedom) {
                    const raw = SERVER_CONFIG.bankBalances.freedom.toString().replace(/,/g, '').replace(/\s/g, '');
                    const v = parseFloat(raw);
                    if (!isNaN(v) && v > 0) kzt = v;
                }
                if (kzt <= 0) return { ok: false, msg: 'Không có số dư KZT Freedom' };
                quantity = (Math.floor((kzt / priceFloat) * 100) / 100).toFixed(2);
            } else {
                // BÁN: lấy số dư USDT Funding trực tiếp
                const balRes = await fetch('/api/usdt_balance', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig })
                });
                const balData = await balRes.json();
                let fundAvail = 0;
                if (balData.status === 'success' && balData.data && balData.data.FUND) {
                    const fund = balData.data.FUND;
                    if (fund.retCode === 0 && fund.result && Array.isArray(fund.result.balance)) {
                        const usdtObj = fund.result.balance.find(b => b.coin === "USDT");
                        if (usdtObj) fundAvail = parseFloat(usdtObj.transferBalance || 0);
                    }
                }
                if (fundAvail <= 0) return { ok: false, msg: 'Không có số dư USDT Funding' };
                quantity = (Math.floor(fundAvail * 100) / 100).toFixed(2);
            }

            // 5) Remark mặc định
            let remark = "";
            try {
                const list = JSON.parse(localStorage.getItem('savedAdRemarks') || '[]');
                const def = list.find(x => x.isDefault === true);
                if (def) remark = def.content;
            } catch(_) {}

            // 6) Gọi /api/post_ad
            const payload = {
                tokenId: "USDT", currencyId: "KZT", side: side,
                priceType: "0", premium: "0",
                price: priceFloat.toString(),
                minAmount, maxAmount, remark, quantity,
                paymentPeriod: "15", itemType: "ORIGIN",
                paymentIds: paymentIds,
                tradingPreferenceSet: {
                    hasUnPostAd: "0", isKyc: "1", isEmail: "1", isMobile: "1",
                    hasRegisterTime: "1", registerTimeThreshold: "15",
                    hasOrderFinishNumberDay30: "0", orderFinishNumberDay30: "0",
                    hasCompleteRateDay30: "0", completeRateDay30: "0",
                    hasNationalLimit: "0", nationalLimit: ""
                }
            };

            const response = await fetch('/api/post_ad', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    group: currentGroup, account_index: selectedAccountIndex,
                    proxy: proxyConfig, payload: payload
                })
            });
            const data = await response.json();

            if (data.status === 'success') {
                const itemId = data.data && data.data.itemId ? data.data.itemId : null;
                if (itemId) {
                    const adIdStr = itemId.toString();
                    // Gán Mốc
                    if (typeof window.setAdTier === 'function') window.setAdTier(adIdStr, tier.toString());
                    else localStorage.setItem('ad_tier_' + adIdStr, tier.toString());
                    // Bật Auto Update
                    let curSet = window.getAutoUpdateAds();
                    curSet.add(adIdStr);
                    window.setAutoUpdateAds(curSet);
                }
                return { ok: true, msg: `itemId=${itemId || '?'} | Mốc ${tier} | Auto ON` };
            } else {
                return { ok: false, msg: data.message || 'Lỗi không rõ' };
            }
        } catch(e) {
            return { ok: false, msg: 'Lỗi kết nối: ' + (e.message || e) };
        }
    };
        // === Đăng nhiều QC SONG SONG qua /api/post_ads_batch + tự bật Auto Update + Auto Tăng U cho QC BÁN ===
    window.batchPostJobs = async function(jobs) {
        // jobs: [{side, tier, label}, ...]
        const proxyConfig = {
            ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "",
            port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "",
            user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "",
            pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : ""
        };

        // === Lấy PTTT Freedom 1 lần ===
        let paymentIds = [];
        try {
            const resPay = await fetch('/api/payments', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig })
            });
            const payData = await resPay.json();
            if (payData.status === 'success' && Array.isArray(payData.data)) {
                const freedomPays = payData.data.filter(p => {
                    const name = (p.paymentConfigVo ? p.paymentConfigVo.paymentName : '') ||
                                 (typeof PAYMENT_METHODS !== 'undefined' ? (PAYMENT_METHODS[p.paymentType] || '') : '');
                    return name.toLowerCase().includes('freedom');
                });
                paymentIds = freedomPays.slice(0, 5).map(p => p.id.toString());
            }
        } catch(e) {}
        if (paymentIds.length === 0) {
            return { results: jobs.map(j => ({ label: j.label, ok: false, msg: 'Không tìm thấy PTTT Freedom' })) };
        }

        // === Lấy KZT Freedom + USDT Funding 1 lần ===
        let kztBalance = 0, fundBalance = 0;
        const elBank = document.getElementById('bankFreedom');
        if (elBank && elBank.value) {
            const v = parseFloat(elBank.value.toString().replace(/,/g, '').replace(/\s/g, ''));
            if (!isNaN(v) && v > 0) kztBalance = v;
        }
        if (kztBalance === 0 && typeof SERVER_CONFIG !== 'undefined' && SERVER_CONFIG.bankBalances && SERVER_CONFIG.bankBalances.freedom) {
            const raw = SERVER_CONFIG.bankBalances.freedom.toString().replace(/,/g, '').replace(/\s/g, '');
            const v = parseFloat(raw);
            if (!isNaN(v) && v > 0) kztBalance = v;
        }
        try {
            const balRes = await fetch('/api/usdt_balance', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig })
            });
            const balData = await balRes.json();
            if (balData.status === 'success' && balData.data && balData.data.FUND) {
                const fund = balData.data.FUND;
                if (fund.retCode === 0 && fund.result && Array.isArray(fund.result.balance)) {
                    const usdtObj = fund.result.balance.find(b => b.coin === "USDT");
                    if (usdtObj) fundBalance = parseFloat(usdtObj.transferBalance || 0);
                }
            }
        } catch(e) {}

        // === Remark mặc định ===
        let remark = "";
        try {
            const list = JSON.parse(localStorage.getItem('savedAdRemarks') || '[]');
            const def = list.find(x => x.isDefault === true);
            if (def) remark = def.content;
        } catch(_) {}

        // === Build items ===
        const items = [];
        const skipped = [];
        for (const j of jobs) {
            const priceElId = j.side === "0" ? `t${j.tier}BuyP` : `t${j.tier}SellP`;
            const priceDOM = document.getElementById(priceElId) || document.querySelector(`.sync-${priceElId}`);
            if (!priceDOM || !priceDOM.innerText || priceDOM.innerText === "..." || priceDOM.innerText === "NaN") {
                skipped.push({ label: j.label, ok: false, msg: `Thiếu giá Mốc ${j.tier}`, tag: `${j.side}_${j.tier}` });
                continue;
            }
            const priceFloat = parseFloat(priceDOM.innerText.replace(/,/g, '').trim());
            if (isNaN(priceFloat) || priceFloat <= 0) {
                skipped.push({ label: j.label, ok: false, msg: `Giá Mốc ${j.tier} không hợp lệ`, tag: `${j.side}_${j.tier}` });
                continue;
            }
            const getNum = (id) => {
                const el = document.getElementById(id);
                if (!el) return 0;
                const v = parseFloat(el.value || el.placeholder || 0);
                return isNaN(v) ? 0 : v;
            };
            const tMin = getNum(`tier${j.tier}Min`);
            const tMax = getNum(`tier${j.tier}Max`);
            if (tMin <= 0 || tMax <= 0) {
                skipped.push({ label: j.label, ok: false, msg: `Thiếu Min/Max Mốc ${j.tier}`, tag: `${j.side}_${j.tier}` });
                continue;
            }
            const minAmount = (tMin * priceFloat).toFixed(2);
            const maxAmount = (tMax * priceFloat).toFixed(2);

            let quantity;
            if (j.side === "0") {
                if (kztBalance <= 0) {
                    skipped.push({ label: j.label, ok: false, msg: 'Không có KZT Freedom', tag: `${j.side}_${j.tier}` });
                    continue;
                }
                quantity = (Math.floor((kztBalance / priceFloat) * 100) / 100).toFixed(2);
            } else {
                if (fundBalance <= 0) {
                    skipped.push({ label: j.label, ok: false, msg: 'Không có USDT Funding', tag: `${j.side}_${j.tier}` });
                    continue;
                }
                quantity = (Math.floor(fundBalance * 100) / 100).toFixed(2);
            }

            items.push({
                tag: `${j.side}_${j.tier}`,
                _label: j.label, _side: j.side, _tier: j.tier,
                payload: {
                    tokenId: "USDT", currencyId: "KZT", side: j.side,
                    priceType: "0", premium: "0",
                    price: priceFloat.toString(),
                    minAmount, maxAmount, remark, quantity,
                    paymentPeriod: "15", itemType: "ORIGIN",
                    paymentIds: paymentIds,
                    tradingPreferenceSet: {
                        hasUnPostAd: "0", isKyc: "1", isEmail: "1", isMobile: "1",
                        hasRegisterTime: "1", registerTimeThreshold: "15",
                        hasOrderFinishNumberDay30: "0", orderFinishNumberDay30: "0",
                        hasCompleteRateDay30: "0", completeRateDay30: "0",
                        hasNationalLimit: "0", nationalLimit: ""
                    }
                }
            });
        }

        if (items.length === 0) {
            return { results: skipped };
        }

        // === Gọi /api/post_ads_batch (server bắn song song) ===
        const sendItems = items.map(it => ({ tag: it.tag, payload: it.payload }));
        let serverResults = [];
        try {
            const response = await fetch('/api/post_ads_batch', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    group: currentGroup, account_index: selectedAccountIndex,
                    proxy: proxyConfig, items: sendItems
                })
            });
            const data = await response.json();
            if (data.status === 'success' && Array.isArray(data.results)) {
                serverResults = data.results;
            } else {
                return { results: items.map(it => ({ label: it._label, ok: false, msg: data.message || 'Server lỗi' })).concat(skipped) };
            }
        } catch(e) {
            return { results: items.map(it => ({ label: it._label, ok: false, msg: 'Lỗi kết nối: ' + e.message })).concat(skipped) };
        }

        // === Map kết quả & gán Mốc + Auto Update + Auto Tăng U (BÁN) ===
        const final = [];
        for (const it of items) {
            const r = serverResults.find(s => s.tag === it.tag);
            if (r && r.ok && r.itemId) {
                const adIdStr = r.itemId.toString();
                // Gán Mốc
                if (typeof window.setAdTier === 'function') window.setAdTier(adIdStr, it._tier.toString());
                else localStorage.setItem('ad_tier_' + adIdStr, it._tier.toString());
                // Bật Auto Update
                let s1 = window.getAutoUpdateAds(); s1.add(adIdStr); window.setAutoUpdateAds(s1);
                // Bật Auto Tăng U cho CẢ QC BÁN lẫn QC MUA
                let s2 = window.getAutoAddUsdtAds(); s2.add(adIdStr); window.setAutoAddUsdtAds(s2);
                final.push({ label: it._label, ok: true, msg: 'OK', itemId: r.itemId });
            } else {
                final.push({ label: it._label, ok: false, msg: (r && r.message) ? r.message : 'Không rõ' });
            }
        }
        return { results: final.concat(skipped) };
    };
    // === Lưu trạng thái Switch ===
    window.getActivityMode = function() {
        return localStorage.getItem('activityMode') === 'on';
    };
    window.setActivityMode = function(on) {
        localStorage.setItem('activityMode', on ? 'on' : 'off');
    };

    // === Inject Switch UI ===
    const timeSpan = document.getElementById('timeRefreshOnlineAds');
    if (timeSpan && !document.getElementById('activityToggleBox')) {
        const box = document.createElement('div');
        box.id = 'activityToggleBox';
        box.className = 'd-inline-flex align-items-center me-3';
        box.innerHTML = `
            <span id="activityModeLabel" class="fw-bold me-2" style="font-size: 13px;">Đang: <span id="activityModeText" class="text-secondary">Nghỉ</span></span>
            <label class="form-switch m-0 p-0 d-flex align-items-center" style="cursor:pointer;">
                <input type="checkbox" id="activityToggleSwitch" class="form-check-input m-0" style="width: 52px; height: 28px; cursor: pointer;">
            </label>
        `;
        timeSpan.parentNode.insertBefore(box, timeSpan);

        const sw = document.getElementById('activityToggleSwitch');
        const lblText = document.getElementById('activityModeText');

        const refreshLabel = () => {
            const on = sw.checked;
            lblText.innerText = on ? 'Hoạt động' : 'Nghỉ';
            lblText.className = on ? 'text-success fw-bold' : 'text-secondary';
        };

        // Khôi phục trạng thái lưu
        sw.checked = window.getActivityMode();
        refreshLabel();

        sw.addEventListener('change', async (e) => {
            const turningOn = e.target.checked;
            sw.disabled = true;

            try {
                // ====== B1: TẮT TẤT CẢ QC ONLINE (song song) ======
                _showStatusOverlay(turningOn ? 'Bước 1/2: Đang tắt tất cả QC (song song)...' : 'Đang tắt tất cả QC (song song)...');
                await window.fetchMyAdsBackground();
                const offRes = await window.turnOffAllOnlineAds((done, total, adId) => {
                    _updateStatusOverlay(null, `Đã tắt ${done}/${total} (Ad ${adId})`);
                });

                if (!turningOn) {
                    window.setActivityMode(false);
                    refreshLabel();
                    sw.disabled = false;
                    _finishStatusOverlay(true, 'Đã chuyển sang NGHỈ', `Đã tắt ${offRes.success}/${offRes.total} QC.`);
                    window.fetchMyAdsBackground();
                    return;
                }

                // ====== B2: ĐĂNG 4 QC MỚI SONG SONG (dùng /api/post_ads_batch) ======
                _updateStatusOverlay('Bước 2/2: Đang đăng 4 QC mới (song song)...', `Đã tắt ${offRes.success}/${offRes.total} QC.\nServer xử lý đa luồng...`);

                // Đợi 1 nhịp để Bybit cập nhật
                await new Promise(r => setTimeout(r, 800));

                const jobs = [
                    { side: "1", tier: "1", label: "BÁN Mốc 1" },
                    { side: "1", tier: "2", label: "BÁN Mốc 2" },
                    { side: "1", tier: "3", label: "BÁN Mốc 3" },
                    { side: "0", tier: "2", label: "MUA Mốc 2" }
                ];

                const r = await window.batchPostJobs(jobs);
                const okCnt = r.results.filter(x => x.ok).length;
                const summary = r.results.map(x => `${x.ok ? '✅' : '❌'} ${x.label}${x.ok ? ` (#${x.itemId})` : ': ' + x.msg}`).join('\n');

                window.setActivityMode(okCnt === jobs.length);
                if (okCnt !== jobs.length) sw.checked = false;
                refreshLabel();
                sw.disabled = false;

                _finishStatusOverlay(
                    okCnt === jobs.length,
                    okCnt === jobs.length ? 'Đã chuyển sang HOẠT ĐỘNG' : `Hoàn tất ${okCnt}/${jobs.length} QC`,
                    `Tắt cũ: ${offRes.success}/${offRes.total}\n${summary}`,
                    okCnt === jobs.length ? 2500 : 6000
                );

                window.fetchMyAdsBackground();
            } catch(err) {
                sw.checked = !turningOn; refreshLabel(); sw.disabled = false;
                _finishStatusOverlay(false, 'Lỗi xử lý', err.message || String(err), 4000);
            }
        });
    }
    // ==========================================================
    // === END Switch Hoạt động / Nghỉ ==========================
    // ==========================================================

    if(document.getElementById('btnRefreshOnlineAds')) {
        document.getElementById('btnRefreshOnlineAds').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            window.fetchMyAdsBackground().finally(() => {
                btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            });
        });
    }

    // --- SỰ KIỆN GỌI NÚT BỔ SUNG USDT THỦ CÔNG MỞ MODAL ---
    document.getElementById('onlineAdsBodyOrdersTab')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-add-u-ext');
        if (!btn) return;
        
        const adId = btn.dataset.id;
        const ad = window.myPersonalAds_OrdersTab.find(a => a.id === adId);
        if (!ad) return showToast('Không tìm thấy QC', 'danger');
        
        currentAddingAd = ad;
        
        const fundAvailText = document.getElementById('balFundAvail') ? document.getElementById('balFundAvail').innerText.replace(/,/g, '') : "0";
        const fundAvail = parseFloat(fundAvailText) || 0;
        const currentQty = parseFloat(ad.lastQuantity || 0);
        
        let maxAddable = 0;
        if (ad.side === 1) { 
            maxAddable = fundAvail - currentQty;
        } else { 
            maxAddable = 2000 - currentQty;
        }

        if (maxAddable < 0) maxAddable = 0; 
        
        let displayMax = maxAddable - 0.01;
        if(displayMax < 0) displayMax = 0;
        
        if(document.getElementById('addU_adId')) document.getElementById('addU_adId').innerText = adId;
        if(document.getElementById('addU_fundAvail')) document.getElementById('addU_fundAvail').innerText = fundAvail.toLocaleString(undefined, {maximumFractionDigits: 2}) + ' USDT';
        if(document.getElementById('addU_currentQty')) document.getElementById('addU_currentQty').innerText = currentQty.toLocaleString(undefined, {maximumFractionDigits: 3}) + ' USDT';
        if(document.getElementById('addU_maxAddable')) document.getElementById('addU_maxAddable').innerText = displayMax.toLocaleString(undefined, {maximumFractionDigits: 2}) + ' USDT';
        
        const amountInput = document.getElementById('addU_amount');
        if(amountInput) {
            amountInput.value = '';
            amountInput.max = displayMax.toFixed(2);
        }
        
        if(addUsdtModal) addUsdtModal.show();
    });

    if(document.getElementById('btnMaxAddU')) {
        document.getElementById('btnMaxAddU').addEventListener('click', () => {
            if(!currentAddingAd) return;
            const fundAvailText = document.getElementById('balFundAvail') ? document.getElementById('balFundAvail').innerText.replace(/,/g, '') : "0";
            const fundAvail = parseFloat(fundAvailText) || 0;
            const currentQty = parseFloat(currentAddingAd.lastQuantity || 0);
            
            let maxAddable = 0;
            if (currentAddingAd.side === 1) { 
                maxAddable = fundAvail - currentQty;
            } else {
                maxAddable = 2000 - currentQty;
            }

            if (maxAddable < 0) maxAddable = 0;

            let safeMax = maxAddable - 0.01;
            if(safeMax < 0) safeMax = 0;

            document.getElementById('addU_amount').value = safeMax.toFixed(2);
        });
    }

    if(document.getElementById('btnConfirmAddU')) {
        document.getElementById('btnConfirmAddU').addEventListener('click', async () => {
            if(!currentAddingAd) return;
            const amountInput = document.getElementById('addU_amount');
            const addAmount = parseFloat(amountInput.value);
            if(isNaN(addAmount) || addAmount <= 0) return showToast('Vui lòng nhập số lượng hợp lệ!', 'warning');

            const fundAvailText = document.getElementById('balFundAvail') ? document.getElementById('balFundAvail').innerText.replace(/,/g, '') : "0";
            const fundAvail = parseFloat(fundAvailText) || 0;
            const currentQtyCheck = parseFloat(currentAddingAd.lastQuantity || 0);
            
            let maxAddableCheck = 0;
            if (currentAddingAd.side === 1) { 
                maxAddableCheck = fundAvail - currentQtyCheck;
            } else { 
                maxAddableCheck = 2000 - currentQtyCheck;
            }
            if(maxAddableCheck < 0) maxAddableCheck = 0;

            if(addAmount > maxAddableCheck) {
                return showToast(`Chỉ có thể bổ sung tối đa ${maxAddableCheck.toFixed(2)} USDT!`, 'danger');
            }

            const btn = document.getElementById('btnConfirmAddU');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
            btn.disabled = true;

            const res = await window.doAddUsdtToAd(currentAddingAd, addAmount);
            if(res.success) {
                showToast('Đã bổ sung USDT thành công!', 'success');
                if(addUsdtModal) addUsdtModal.hide();
                if(window.loadUsdtBalance) window.loadUsdtBalance();
                if(window.fetchMyAdsBackground) window.fetchMyAdsBackground();
            } else {
                showToast('Lỗi: ' + res.message, 'danger');
            }

            btn.innerHTML = originalHtml;
            btn.disabled = false;
        });
    }
});