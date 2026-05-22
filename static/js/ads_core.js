// --- HÀM QUẢN LÝ LƯU TRỮ TUYỆT ĐỐI ---
window.getAutoUpdateAds = function() {
    try { return new Set(JSON.parse(localStorage.getItem('autoUpdateAds') || '[]')); } 
    catch(e) { return new Set(); }
};
window.setAutoUpdateAds = function(setObj) {
    localStorage.setItem('autoUpdateAds', JSON.stringify(Array.from(setObj)));
    window.autoUpdateAds = setObj;
};

// Hàm lấy Mốc được gán cho 1 Ads
window.getAdTier = function(adId) {
    return localStorage.getItem('ad_tier_' + adId) || "1";
};
window.setAdTier = function(adId, tierValue) {
    localStorage.setItem('ad_tier_' + adId, tierValue);
};
// ============================================================
// ===== GLOBAL AUTO-UPDATE GIÁ QC (chạy trên MỌI tab) ========
// ============================================================
// Khởi tạo state toàn cục — dùng được khi không vào tab /ads
window.lastAdUpdateTimes   = window.lastAdUpdateTimes   || {};
window.autoUpdateActiveAds = window.autoUpdateActiveAds || new Set();

// Terminal log an toàn (no-op nếu không có #terminalLog — tức là không ở /ads)
window.addTerminalLog = window.addTerminalLog || function(msg, type = "info") {
    try {
        const term = document.getElementById('terminalLog');
        if (term) {
            const time = new Date().toLocaleTimeString('vi-VN');
            const color = type === 'success' ? '#0f0'
                        : (type === 'danger' || type === 'warning') ? '#f55'
                        : '#0ff';
            const div = document.createElement('div');
            div.style.color = color;
            div.innerHTML = `[${time}] ${msg}`;
            term.prepend(div);
        }
        // Có hoặc không có terminal, vẫn log ra console để bot keepalive còn thấy
        console.log(`[AutoUpdate ${type}] ${msg}`);
    } catch(e) {}
};

// Lấy danh sách QC hiện tại: ưu tiên tab /ads, fallback sang tab /orders
window.getCurrentAdsList = function() {
    if (window.currentMyAds && window.currentMyAds.length) return window.currentMyAds;
    if (window.myPersonalAds_OrdersTab && window.myPersonalAds_OrdersTab.length) return window.myPersonalAds_OrdersTab;
    return [];
};

// Lấy proxy config từ DOM (tab nào cũng có proxy* inputs trong account_panel)
window._getProxyConfig = function() {
    return {
        ip:   document.getElementById('proxyIp')   ? document.getElementById('proxyIp').value.trim()   : "",
        port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "",
        user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "",
        pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : ""
    };
};

// Hàm global — sẽ bị ghi đè bởi hàm local trong DOMContentLoaded khi ở /ads
window.triggerAutoUpdateAds = async function() {
    try {
        window.autoUpdateAds = window.getAutoUpdateAds();
        if (!window.autoUpdateAds || window.autoUpdateAds.size === 0) return;
        if (typeof selectedAccountIndex === 'undefined' || selectedAccountIndex === null) return;

        // Chỉ chạy khi đã LOCK config (giống các loop khác trong app)
        const confArea = document.getElementById('configArea');
        if (!confArea || !confArea.classList.contains('locked-overlay')) return;

        const freqSelect = document.getElementById('adUpdateFreq') || document.querySelector('.sync-adUpdateFreq');
        const freqMinutes = freqSelect ? parseInt(freqSelect.value) : 3;
        const freqMs = freqMinutes * 60 * 1000;

        const adsList = window.getCurrentAdsList();
        if (!adsList.length) return;

        const proxyConfig = window._getProxyConfig();

        for (let adId of window.autoUpdateAds) {
            if (window.autoUpdateActiveAds.has(adId)) continue;
            const ad = adsList.find(a => a.id === adId);
            if (!ad) continue;
            if (parseInt(ad.status) !== 10) continue; // chỉ sửa QC đang Online

            const assignedTier = window.getAdTier(adId);
            const priceElId = ad.side === 0 ? `t${assignedTier}BuyP` : `t${assignedTier}SellP`;
            const priceDOM = document.getElementById(priceElId) || document.querySelector(`.sync-${priceElId}`);
            if (!priceDOM || !priceDOM.innerText || priceDOM.innerText === "..." || priceDOM.innerText === "NaN") continue;

            const targetPriceFloat = parseFloat(priceDOM.innerText.replace(/,/g, '').trim());
            if (isNaN(targetPriceFloat)) continue;
            const targetPrice = targetPriceFloat.toString();
            if (parseFloat(ad.price) === parseFloat(targetPrice)) continue;

            const lastUpdate = window.lastAdUpdateTimes[adId] || 0;
            if (Date.now() - lastUpdate < freqMs) continue;

            window.autoUpdateActiveAds.add(adId);
            try {
                // Lấy chi tiết QC để build payload đầy đủ
                const resInfo = await fetch('/api/ad_info', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig,
                        item_id: adId, itemId: adId,
                        payload: { itemId: adId, item_id: adId, id: adId }
                    })
                });
                const infoData = await resInfo.json();
                if (infoData.status !== 'success') throw new Error(infoData.message || "Lỗi lấy info");
                const adDetails = infoData.data;

                // Lấy PTTT khả dụng
                const resPay = await fetch('/api/payments', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig })
                });
                const payData = await resPay.json();
                let validPaymentIds = [];
                if (payData.status === 'success' && Array.isArray(payData.data)) {
                    const userPayments = payData.data;
                    if (adDetails.paymentTerms && adDetails.paymentTerms.length > 0) {
                        adDetails.paymentTerms.forEach(pt => {
                            if (pt.id && pt.id !== "-1" && userPayments.find(up => up.id == pt.id)) {
                                validPaymentIds.push(pt.id.toString());
                            }
                        });
                    }
                    if (validPaymentIds.length === 0) {
                        (adDetails.payments || []).forEach(pType => {
                            const match = userPayments.find(p => p.paymentType == pType);
                            if (match) validPaymentIds.push(match.id.toString());
                        });
                    }
                }
                validPaymentIds = [...new Set(validPaymentIds)].slice(0, 5);
                if (validPaymentIds.length === 0) throw new Error("Không tìm thấy PTTT phù hợp");

                const pref = adDetails.tradingPreferenceSet || {};
                const buildPref = {
                    hasUnPostAd:               (pref.hasUnPostAd               || 0).toString(),
                    isKyc:                     (pref.isKyc                     || 0).toString(),
                    isEmail:                   (pref.isEmail                   || 0).toString(),
                    isMobile:                  (pref.isMobile                  || 0).toString(),
                    hasRegisterTime:           (pref.hasRegisterTime           || 0).toString(),
                    registerTimeThreshold:     (pref.registerTimeThreshold     || 0).toString(),
                    hasOrderFinishNumberDay30: (pref.hasOrderFinishNumberDay30 || 0).toString(),
                    orderFinishNumberDay30:    (pref.orderFinishNumberDay30    || 0).toString(),
                    hasCompleteRateDay30:      (pref.hasCompleteRateDay30      || 0).toString(),
                    completeRateDay30:         (pref.completeRateDay30         || 0).toString(),
                    hasNationalLimit:          (pref.hasNationalLimit          || 0).toString(),
                    nationalLimit:             pref.nationalLimit || ""
                };

                const modifyPayload = {
                    id:             adDetails.id.toString(),
                    priceType:      adDetails.priceType.toString(),
                    premium:        adDetails.premium ? adDetails.premium.toString() : "0",
                    price:          targetPrice,
                    minAmount:      adDetails.minAmount.toString(),
                    maxAmount:      adDetails.maxAmount.toString(),
                    remark:         adDetails.remark || "",
                    tradingPreferenceSet: buildPref,
                    paymentIds:     validPaymentIds,
                    actionType:     "MODIFY",
                    quantity:       (adDetails.lastQuantity || adDetails.quantity || "0").toString(),
                    paymentPeriod:  adDetails.paymentPeriod ? adDetails.paymentPeriod.toString() : "30"
                };

                const resUpdate = await fetch('/api/relist_ad', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig,
                        item_id: adId, payload: modifyPayload
                    })
                });
                const updateData = await resUpdate.json();

                if (updateData.status === 'success') {
                    window.addTerminalLog(`[Thành công] Ad ${adId} giá mới: ${targetPrice}`, 'success');
                    console.log('__BOT_EVENT__' + JSON.stringify({
                        kind: 'auto_update_ad',
                        status: 'success',
                        ad_id: adId,
                        side: ad.side === 0 ? 'MUA' : 'BÁN',
                        price: targetPrice,
                        message: 'OK (global scheduler)'
                    }));
                    ad.price = targetPrice;
                    const priceDOMM   = document.getElementById(`ad_price_${adId}`);
                    if (priceDOMM)   priceDOMM.innerText   = parseFloat(targetPrice).toLocaleString();
                    const priceOrdDOM = document.getElementById(`ad_price_ord_${adId}`);
                    if (priceOrdDOM) priceOrdDOM.innerText = parseFloat(targetPrice).toLocaleString();
                    window.lastAdUpdateTimes[adId] = Date.now();
                } else {
                    throw new Error(updateData.message);
                }
            } catch (e) {
                const errMsg = e.message || "";
                if (errMsg.includes("912120050") || errMsg.includes("5 minutes")) {
                    window.addTerminalLog(`[Cảnh báo] Ad ${adId} tạm nghỉ 5 phút.`, 'warning');
                    let currentSet = window.getAutoUpdateAds();
                    currentSet.delete(adId.toString());
                    window.setAutoUpdateAds(currentSet);
                    const sw    = document.getElementById(`auto_${adId}`);
                    if (sw)    { sw.checked    = false; sw.disabled    = true; }
                    const swOrd = document.getElementById(`auto_ord_${adId}`);
                    if (swOrd) { swOrd.checked = false; swOrd.disabled = true; }
                    setTimeout(() => {
                        let fresh = window.getAutoUpdateAds();
                        fresh.add(adId.toString());
                        window.setAutoUpdateAds(fresh);
                        const sMain = document.getElementById(`auto_${adId}`);
                        if (sMain) { sMain.checked = true; sMain.disabled = false; }
                        const sOrd  = document.getElementById(`auto_ord_${adId}`);
                        if (sOrd)  { sOrd.checked  = true; sOrd.disabled  = false; }
                        window.addTerminalLog(`[Tự động] BẬT LẠI Auto cho Ad ${adId}`, 'success');
                    }, 305000);
                } else {
                    window.addTerminalLog(`[Lỗi] Ad ${adId}: ${errMsg}`, 'danger');
                    let currentSet = window.getAutoUpdateAds();
                    currentSet.delete(adId.toString());
                    window.setAutoUpdateAds(currentSet);
                    const sw    = document.getElementById(`auto_${adId}`);
                    if (sw)    sw.checked    = false;
                    const swOrd = document.getElementById(`auto_ord_${adId}`);
                    if (swOrd) swOrd.checked = false;
                }
            } finally {
                window.autoUpdateActiveAds.delete(adId);
            }
        }
    } catch(e) {
        console.error('[triggerAutoUpdateAds]', e);
    }
};

// ============================================================
// ===== Scheduler chuyên dụng: 30 giây/lần, mọi tab =========
// ============================================================
// Không phụ thuộc nhịp refresh của market.js (vốn có thể bị "Tắt tự động").
// Bên trong triggerAutoUpdateAds đã check freqMs (3 phút) nên không spam.
if (!window.__autoUpdateAdsInterval) {
    window.__autoUpdateAdsInterval = setInterval(() => {
        if (typeof window.triggerAutoUpdateAds === 'function') {
            window.triggerAutoUpdateAds();
        }
    }, 30000);
}
// ============================================================
