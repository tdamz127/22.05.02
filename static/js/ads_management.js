document.addEventListener('DOMContentLoaded', () => {
    if(typeof isAdsTab === 'undefined' || !isAdsTab) return;
    // ==========================================================
    // ============ LOGIC GỐC: AUTO UPDATE / MY ADS / SUBMIT ====
    // ==========================================================
    window.autoUpdateAds = window.getAutoUpdateAds();
    window.autoUpdateActiveAds = new Set();
    window.currentMyAds = [];
    window.lastAdUpdateTimes = {};

    const confirmModalEl = document.getElementById('actionConfirmModal');
    const confirmModal = confirmModalEl ? new bootstrap.Modal(confirmModalEl) : null;
    const editAdModalEl = document.getElementById('editAdModal');
    const editAdModal = editAdModalEl ? new bootstrap.Modal(editAdModalEl) : null;
    const confirmBtn = document.getElementById('btnConfirmAction');
    let currentActionCallback = null;
    let windowEditAdContext = null;

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if(currentActionCallback) currentActionCallback();
            if(confirmModal) confirmModal.hide();
        });
    }

    function addTerminalLog(msg, type = "info") {
        const term = document.getElementById('terminalLog');
        if(!term) return;
        const time = new Date().toLocaleTimeString('vi-VN');
        const color = type === 'success' ? '#0f0' : (type === 'danger' ? '#f55' : '#0ff');
        const div = document.createElement('div');
        div.style.color = color;
        div.innerHTML = `[${time}] ${msg}`;
        term.prepend(div);
    }

    window.triggerAutoUpdateAds = async () => {
        window.autoUpdateAds = window.getAutoUpdateAds();
        const freqSelect = document.getElementById('adUpdateFreq') || document.querySelector('.sync-adUpdateFreq');
        const freqMinutes = freqSelect ? parseInt(freqSelect.value) : 3;
        const freqMs = freqMinutes * 60 * 1000;

        for(let adId of window.autoUpdateAds) {
            if(window.autoUpdateActiveAds.has(adId)) continue;
            const ad = window.currentMyAds.find(a => a.id === adId);
            if(!ad) continue;
            const assignedTier = window.getAdTier(adId);
            const priceElId = ad.side === 0 ? `t${assignedTier}BuyP` : `t${assignedTier}SellP`;
            const priceDOM = document.getElementById(priceElId) || document.querySelector(`.sync-${priceElId}`);
            if (!priceDOM || !priceDOM.innerText || priceDOM.innerText === "..." || priceDOM.innerText === "NaN") continue;
            const targetPriceFloat = parseFloat(priceDOM.innerText.replace(/,/g, '').trim());
            if(isNaN(targetPriceFloat)) continue;
            const targetPrice = targetPriceFloat.toString();

            if(parseFloat(ad.price) !== parseFloat(targetPrice)) {
                let lastUpdate = window.lastAdUpdateTimes[adId] || 0;
                if (Date.now() - lastUpdate < freqMs) continue;

                window.autoUpdateActiveAds.add(adId);
                addTerminalLog(`Ad ${adId} (${ad.side === 0 ? 'Mua' : 'Bán'}) cập nhật theo Mốc ${assignedTier}: ${ad.price} -> ${targetPrice}...`, 'info');

                try {
                    const fetchCtx = await fetchAdAndMapPayments(adId);
                    if (fetchCtx.error) throw new Error(fetchCtx.error);
                    const { ad: adDetails, validPaymentIds, buildPref, proxyConfig } = fetchCtx;
                    const modifyPayload = {
                        id: adDetails.id.toString(), priceType: adDetails.priceType.toString(),
                        premium: adDetails.premium ? adDetails.premium.toString() : "0",
                        price: targetPrice.toString(), minAmount: adDetails.minAmount.toString(),
                        maxAmount: adDetails.maxAmount.toString(), remark: adDetails.remark || "",
                        tradingPreferenceSet: buildPref, paymentIds: validPaymentIds,
                        actionType: "MODIFY", quantity: (adDetails.lastQuantity || adDetails.quantity || "0").toString(),
                        paymentPeriod: adDetails.paymentPeriod ? adDetails.paymentPeriod.toString() : "30"
                    };
                    const resUpdate = await fetch('/api/relist_ad', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, item_id: adId, payload: modifyPayload })
                    });
                    const updateData = await resUpdate.json();
                    if (updateData.status === 'success') {
                        addTerminalLog(`[Thành công] Ad ${adId} giá mới: ${targetPrice}`, 'success');
                        ad.price = targetPrice.toString();
                        const priceDOMM = document.getElementById(`ad_price_${adId}`);
                        if(priceDOMM) priceDOMM.innerText = parseFloat(targetPrice).toLocaleString();
                        const priceOrdDOM = document.getElementById(`ad_price_ord_${adId}`);
                        if(priceOrdDOM) priceOrdDOM.innerText = parseFloat(targetPrice).toLocaleString();
                        window.lastAdUpdateTimes[adId] = Date.now();
                    } else throw new Error(updateData.message);
                } catch(e) {
                    const errMsg = e.message || "";
                    if (errMsg.includes("912120050") || errMsg.includes("5 minutes")) {
                        addTerminalLog(`[Cảnh báo] Ad ${adId} tạm nghỉ 5 phút.`, 'warning');
                        let currentSet = window.getAutoUpdateAds();
                        currentSet.delete(adId.toString());
                        window.setAutoUpdateAds(currentSet);
                        const sw = document.getElementById(`auto_${adId}`);
                        if(sw) { sw.checked = false; sw.disabled = true; }
                        const swOrd = document.getElementById(`auto_ord_${adId}`);
                        if(swOrd) { swOrd.checked = false; swOrd.disabled = true; }
                        setTimeout(() => {
                            let freshSet = window.getAutoUpdateAds();
                            freshSet.add(adId.toString());
                            window.setAutoUpdateAds(freshSet);
                            const switchMain = document.getElementById(`auto_${adId}`);
                            if(switchMain) { switchMain.checked = true; switchMain.disabled = false; }
                            const switchOrd = document.getElementById(`auto_ord_${adId}`);
                            if(switchOrd) { switchOrd.checked = true; switchOrd.disabled = false; }
                            addTerminalLog(`[Tự động] BẬT LẠI Auto cho Ad ${adId}`, 'success');
                        }, 305000);
                    } else {
                        addTerminalLog(`[Lỗi] Ad ${adId}: ${errMsg}`, 'danger');
                        let currentSet = window.getAutoUpdateAds();
                        currentSet.delete(adId.toString());
                        window.setAutoUpdateAds(currentSet);
                        const sw = document.getElementById(`auto_${adId}`);
                        if(sw) sw.checked = false;
                        const swOrd = document.getElementById(`auto_ord_${adId}`);
                        if(swOrd) swOrd.checked = false;
                    }
                } finally {
                    window.autoUpdateActiveAds.delete(adId);
                }
            }
        }
    };

    async function fetchAdAndMapPayments(itemId) {
        const proxyConfig = {
            ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "",
            port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "",
            user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "",
            pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : ""
        };
        const resInfo = await fetch('/api/ad_info', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, item_id: itemId, itemId: itemId, payload: { itemId: itemId, item_id: itemId, id: itemId } })
        });
        const infoData = await resInfo.json();
        if (infoData.status !== 'success') return { error: "Lỗi lấy thông tin: " + infoData.message };
        const ad = infoData.data;
        const resPay = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig }) });
        const payData = await resPay.json();
        let validPaymentIds = [];
        if (payData.status === 'success' && Array.isArray(payData.data)) {
            const userPayments = payData.data;
            if (ad.paymentTerms && ad.paymentTerms.length > 0) {
                ad.paymentTerms.forEach(pt => { if (pt.id && pt.id !== "-1" && userPayments.find(up => up.id == pt.id)) validPaymentIds.push(pt.id.toString()); });
            }
            if (validPaymentIds.length === 0) {
                (ad.payments || []).forEach(pType => {
                    const match = userPayments.find(p => p.paymentType == pType);
                    if (match) validPaymentIds.push(match.id.toString());
                });
            }
        }
        if (validPaymentIds.length === 0) return { error: "Không tìm thấy PTTT phù hợp!" };
        validPaymentIds = [...new Set(validPaymentIds)].slice(0, 5);
        const pref = ad.tradingPreferenceSet || {};
        const buildPref = {
            hasUnPostAd: (pref.hasUnPostAd || 0).toString(), isKyc: (pref.isKyc || 0).toString(),
            isEmail: (pref.isEmail || 0).toString(), isMobile: (pref.isMobile || 0).toString(),
            hasRegisterTime: (pref.hasRegisterTime || 0).toString(), registerTimeThreshold: (pref.registerTimeThreshold || 0).toString(),
            hasOrderFinishNumberDay30: (pref.hasOrderFinishNumberDay30 || 0).toString(), orderFinishNumberDay30: (pref.orderFinishNumberDay30 || 0).toString(),
            hasCompleteRateDay30: (pref.hasCompleteRateDay30 || 0).toString(), completeRateDay30: (pref.completeRateDay30 || 0).toString(),
            hasNationalLimit: (pref.hasNationalLimit || 0).toString(), nationalLimit: pref.nationalLimit || ""
        };
        return { ad, validPaymentIds, buildPref, proxyConfig };
    }

    // Tab switching
    document.querySelectorAll('#adsSubTabs .nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('#adsSubTabs .nav-link').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            const targetId = e.target.dataset.target;
            if (document.getElementById('postAdForm')) document.getElementById('postAdForm').classList.add('d-none');
            if (document.getElementById('myAdsList')) document.getElementById('myAdsList').classList.add('d-none');
            if (document.getElementById(targetId)) document.getElementById(targetId).classList.remove('d-none');
            if (targetId === 'myAdsList') {
                const tbody = document.getElementById('myAdsTableBody');
                if (tbody && tbody.innerHTML.includes('Đang tải')) loadMyAdsList();
            }
        });
    });

    const btnRefreshMyAds = document.getElementById('btnRefreshMyAds');
    if (btnRefreshMyAds) btnRefreshMyAds.addEventListener('click', () => loadMyAdsList());

    setTimeout(() => {
        if (typeof SERVER_CONFIG !== 'undefined' && SERVER_CONFIG.is_locked) loadMyAdsList();
    }, 500);

    async function loadMyAdsList(silent = false) {
        const tbody = document.getElementById('myAdsTableBody');
        if(!tbody) return;
        if (!silent) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4"><i class="fas fa-spinner fa-spin text-primary fa-2x"></i><div class="mt-2">Đang tải...</div></td></tr>';
        }
        try {
            const proxyConfig = {
                ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "",
                port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "",
                user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "",
                pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : ""
            };
            const currentToken = document.getElementById('adTokenId') ? document.getElementById('adTokenId').value.trim() : "USDT";
            const currentFiat = document.getElementById('adCurrencyId') ? document.getElementById('adCurrencyId').value.trim() : "KZT";
            const filterPaymentEl = document.getElementById('filterPayment');
            const filterPayment = filterPaymentEl ? filterPaymentEl.value.trim().toLowerCase() : "";
            const response = await fetch('/api/my_ads', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: { "tokenId": currentToken, "currencyId": currentFiat } })
            });
            const data = await response.json();
            if (data.status === 'success') {
                const items = data.data.items || [];
                window.currentMyAds = items;
                window.autoUpdateAds = window.getAutoUpdateAds();
                if(items.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Chưa có quảng cáo nào.</td></tr>'; return; }
                items.sort((a, b) => {
                    const aOnline = parseInt(a.status) === 10 ? 1 : 0;
                    const bOnline = parseInt(b.status) === 10 ? 1 : 0;
                    if (aOnline !== bOnline) return bOnline - aOnline;
                    if (aOnline === 1) {
                        const aSide = parseInt(a.side); const bSide = parseInt(b.side);
                        if (aSide !== bSide) return aSide - bSide;
                        const aTier = parseInt(window.getAdTier(a.id)) || 99;
                        const bTier = parseInt(window.getAdTier(b.id)) || 99;
                        if (aTier !== bTier) return aTier - bTier;
                        return (parseInt(b.updateDate) || 0) - (parseInt(a.updateDate) || 0);
                    }
                    return (parseInt(b.updateDate) || 0) - (parseInt(a.updateDate) || 0);
                });
                tbody.innerHTML = '';
                items.forEach(ad => {
                    const updateDateStr = ad.updateDate ? (new Date(parseInt(ad.updateDate)).toLocaleDateString('vi-VN') + ' ' + new Date(parseInt(ad.updateDate)).toLocaleTimeString('vi-VN')) : '---';
                    const sideHtml = ad.side === 0 ? '<span class="badge bg-success">MUA</span>' : '<span class="badge bg-danger">BÁN</span>';
                    let statusHtml = '';
                    const adStatus = parseInt(ad.status);
                    if (adStatus === 10) statusHtml = '<span class="badge bg-success">online</span>';
                    else if (adStatus === 20) statusHtml = '<span class="badge bg-secondary">offline</span>';
                    else if (adStatus === 30) statusHtml = '<span class="badge bg-primary">completed</span>';
                    else statusHtml = `<span class="badge bg-dark">${ad.status}</span>`;
                    let paymentNames = (ad.payments || []).map(pId => (typeof PAYMENT_METHODS !== 'undefined' && PAYMENT_METHODS[pId]) ? PAYMENT_METHODS[pId] : `Bank (${pId})`).join(', ');
                    let actionHtml = '';
                    const adStatusInt = parseInt(ad.status);
                    if (adStatusInt === 10) {
                        actionHtml += `<button class="btn btn-sm btn-outline-primary btn-edit-ad mb-1 w-100" data-id="${ad.id}"><i class="fas fa-edit"></i> Sửa QC</button>`;
                        actionHtml += `<button class="btn btn-sm btn-outline-danger btn-cancel-ad mb-1 w-100" data-id="${ad.id}"><i class="fas fa-power-off"></i> Tắt QC</button>`;
                    }
                    if (adStatusInt === 20) {
                        actionHtml += `<button class="btn btn-sm btn-outline-primary btn-edit-ad mb-1 w-100" data-id="${ad.id}"><i class="fas fa-edit"></i> Sửa QC</button>`;
                        actionHtml += `<button class="btn btn-sm btn-outline-success btn-relist-ad w-100" data-id="${ad.id}"><i class="fas fa-sync"></i> Đăng Lại</button>`;
                    }
                    let isOnline = parseInt(ad.status) === 10;
                    let matchPair = (ad.tokenId === currentToken && ad.currencyId === currentFiat);
                    let matchPay = true;
                    if (filterPayment && ad.payments) {
                        matchPay = false;
                        for(let payId of ad.payments) {
                            const payName = (typeof PAYMENT_METHODS !== 'undefined' && PAYMENT_METHODS[payId] ? PAYMENT_METHODS[payId] : `Bank (${payId})`).toLowerCase();
                            if (payName.includes(filterPayment)) { matchPay = true; break; }
                        }
                    }
                    let errTexts = [];
                    if (!matchPair) errTexts.push("Sai cặp");
                    if (!matchPay) errTexts.push("Sai PTTT");
                    let isDisabled = !isOnline || !matchPair || !matchPay;
                    let switchLabel = isDisabled ? (isOnline ? errTexts.join(' & ') : 'Đang Offline') : 'Bật Auto Update';
                    if(parseInt(ad.status) !== 10 && window.getAutoUpdateAds().has(ad.id.toString())) {
                        let currentSet = window.getAutoUpdateAds();
                        currentSet.delete(ad.id.toString());
                        window.setAutoUpdateAds(currentSet);
                    }
                    let isChecked = window.getAutoUpdateAds().has(ad.id.toString());
                    let currentAdTier = window.getAdTier(ad.id);
                    let autoHtml = `
                        <div class="mt-2 text-center">
                            <select class="form-select form-select-sm ad-tier-select mx-auto mb-1 fw-bold text-primary" data-id="${ad.id}" style="font-size: 12px; min-width: 125px; width: auto; ${isDisabled ? 'opacity:0.5; pointer-events:none;' : ''}">
                                <option value="1" ${currentAdTier === "1" ? "selected" : ""}>Theo Mốc 1</option>
                                <option value="2" ${currentAdTier === "2" ? "selected" : ""}>Theo Mốc 2</option>
                                <option value="3" ${currentAdTier === "3" ? "selected" : ""}>Theo Mốc 3</option>
                            </select>
                            <div class="form-check form-switch d-flex align-items-center justify-content-center p-0">
                                <input class="form-check-input auto-price-switch m-0 me-2" type="checkbox" id="auto_${ad.id}" data-id="${ad.id}" style="float:none;" ${isDisabled ? 'disabled' : ''} ${isChecked ? 'checked' : ''}>
                                <label class="form-check-label text-${isDisabled ? 'danger' : 'secondary'}" style="font-size:11px;" for="auto_${ad.id}">${switchLabel}</label>
                            </div>
                        </div>`;
                    let priceFloat = parseFloat(ad.price);
                    let minFiat = parseFloat(ad.minAmount);
                    let maxFiat = parseFloat(ad.maxAmount);
                    let minUsdt = priceFloat > 0 ? (minFiat / priceFloat).toFixed(2) : 0;
                    let maxUsdt = priceFloat > 0 ? (maxFiat / priceFloat).toFixed(2) : 0;
                    let frozen = ad.frozenQuantity ? parseFloat(ad.frozenQuantity) : 0;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>
                            <div class="fw-bold text-dark" style="font-size: 13px;">ID: ${ad.id}</div>
                            <div class="text-secondary mt-1" style="font-size: 11px;"><i class="fas fa-sync"></i> ${updateDateStr}</div>
                        </td>
                        <td>${sideHtml} <div class="mt-1 fw-bold text-secondary" style="font-size: 12px;">${ad.tokenId}/${ad.currencyId}</div></td>
                        <td>
                            <div class="price-text" id="ad_price_${ad.id}" style="font-size: 16px;">${priceFloat.toLocaleString()}</div>
                            <div style="font-size: 12px; color: #848e9c; max-width: 120px; white-space: normal;">${paymentNames}</div>
                        </td>
                        <td>
                            <div class="limit-text">${parseFloat(ad.lastQuantity || ad.quantity || 0).toLocaleString()} USDT ${frozen > 0 ? `<span class="text-danger fw-bold ms-1" style="font-size: 11px;">(Khóa: ${frozen})</span>` : ''}</div>
                            <div class="limit-subtext">${minFiat.toLocaleString()} - ${maxFiat.toLocaleString()} ${ad.currencyId}</div>
                            <div class="limit-subtext text-primary mt-1" style="font-size: 11px;">(~ ${parseFloat(minUsdt).toLocaleString()} - ${parseFloat(maxUsdt).toLocaleString()} USDT)</div>
                        </td>
                        <td><div class="text-center">${statusHtml} ${autoHtml}</div></td>
                        <td style="width: 110px;">${actionHtml}</td>`;
                    tbody.appendChild(tr);
                });

                document.querySelectorAll('.ad-tier-select').forEach(selectEl => {
                    selectEl.addEventListener('change', (e) => {
                        const adIdStr = e.target.dataset.id.toString();
                        window.setAdTier(adIdStr, e.target.value);
                        addTerminalLog(`Đã gán Ad ${adIdStr} theo MỐC ${e.target.value}`, 'info');
                    });
                });

                document.querySelectorAll('.auto-price-switch').forEach(sw => {
                    sw.addEventListener('change', (e) => {
                        const adIdStr = e.target.dataset.id.toString();
                        let currentSet = window.getAutoUpdateAds();
                        if(e.target.checked) {
                            currentSet.add(adIdStr);
                            addTerminalLog(`BẬT Auto cho Ad: ${adIdStr}`, 'info');
                        } else {
                            currentSet.delete(adIdStr);
                            addTerminalLog(`TẮT Auto cho Ad: ${adIdStr}`, 'info');
                        }
                        window.setAutoUpdateAds(currentSet);
                        const ordTabSwitch = document.getElementById(`auto_ord_${adIdStr}`);
                        if(ordTabSwitch) ordTabSwitch.checked = e.target.checked;
                    });
                });

                document.querySelectorAll('.btn-cancel-ad').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const btnNode = e.currentTarget;
                        const itemId = btnNode.dataset.id;
                        const originalHtml = btnNode.innerHTML;
                        btnNode.disabled = true;
                        btnNode.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        try {
                            const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
                            const response = await fetch('/api/cancel_ad', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, item_id: itemId, itemId: itemId, payload: { itemId: itemId, item_id: itemId, id: itemId } })
                            });
                            const resData = await response.json();
                            if (resData.status === 'success') {
                                addTerminalLog(`[Tắt QC OK] Ad ${itemId}`, 'success');
                                showToast("Thành công!", "success");
                                let currentSet = window.getAutoUpdateAds();
                                currentSet.delete(itemId.toString());
                                window.setAutoUpdateAds(currentSet);
                                loadMyAdsList(true);
                            } else {
                                addTerminalLog(`[Tắt QC LỖI] Ad ${itemId}: ${resData.message}`, 'danger');
                                showToast("Lỗi: " + resData.message, "danger");
                                btnNode.disabled = false; btnNode.innerHTML = originalHtml;
                            }
                        } catch(err) {
                            addTerminalLog(`[Tắt QC] Lỗi kết nối: ${err.message}`, 'danger');
                            showToast("Lỗi kết nối", "danger");
                            btnNode.disabled = false; btnNode.innerHTML = originalHtml;
                        }
                    });
                });

                document.querySelectorAll('.btn-relist-ad').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const btnNode = e.currentTarget;
                        const itemId = btnNode.dataset.id;
                        const originalHtml = btnNode.innerHTML;
                        btnNode.disabled = true;
                        btnNode.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        addTerminalLog(`[Đăng Lại] Bắt đầu Ad ${itemId}...`, 'info');
                        try {
                            const fetchCtx = await fetchAdAndMapPayments(itemId);
                            if (fetchCtx.error) {
                                addTerminalLog(`[Đăng Lại LỖI] ${fetchCtx.error}`, 'danger');
                                showToast(fetchCtx.error, "danger");
                                btnNode.disabled = false; btnNode.innerHTML = originalHtml; return;
                            }
                            const { ad, validPaymentIds, buildPref, proxyConfig } = fetchCtx;
                            let finalQuantity = (ad.lastQuantity || ad.quantity || "0").toString();
                            if (parseInt(ad.side) === 1) {
                                try {
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
                                    if (fundAvail > 0) {
                                        finalQuantity = (Math.floor(fundAvail * 100) / 100).toFixed(2);
                                        addTerminalLog(`[Đăng Lại] Quantity MAX = ${finalQuantity}`, 'success');
                                    }
                                } catch(balErr) {}
                            }
                            const relistPayload = {
                                id: ad.id.toString(), priceType: ad.priceType.toString(),
                                premium: ad.premium ? ad.premium.toString() : "0",
                                price: ad.price.toString(), minAmount: ad.minAmount.toString(),
                                maxAmount: ad.maxAmount.toString(), remark: ad.remark || "",
                                tradingPreferenceSet: buildPref, paymentIds: validPaymentIds,
                                actionType: "ACTIVE", quantity: finalQuantity,
                                paymentPeriod: ad.paymentPeriod ? ad.paymentPeriod.toString() : "15"
                            };
                            const resUpdate = await fetch('/api/relist_ad', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload: relistPayload })
                            });
                            const updateData = await resUpdate.json();
                            if (updateData.status === 'success') {
                                addTerminalLog(`[Đăng Lại OK] Ad ${itemId}`, 'success');
                                showToast("Đăng lại thành công!", "success");
                                loadMyAdsList(true);
                            } else {
                                addTerminalLog(`[Đăng Lại LỖI] ${updateData.message}`, 'danger');
                                showToast("Lỗi: " + updateData.message, "danger");
                                btnNode.disabled = false; btnNode.innerHTML = originalHtml;
                            }
                        } catch(err) {
                            addTerminalLog(`[Đăng Lại] Lỗi: ${err.message}`, 'danger');
                            showToast("Lỗi kết nối", "danger");
                            btnNode.disabled = false; btnNode.innerHTML = originalHtml;
                        }
                    });
                });

                document.querySelectorAll('.btn-edit-ad').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const btnNode = e.currentTarget;
                        const itemId = btnNode.dataset.id;
                        const originalHtml = btnNode.innerHTML;
                        btnNode.disabled = true;
                        btnNode.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        try {
                            const fetchCtx = await fetchAdAndMapPayments(itemId);
                            btnNode.disabled = false; btnNode.innerHTML = originalHtml;
                            if (fetchCtx.error) { showToast(fetchCtx.error, "danger"); return; }
                            const { ad, validPaymentIds, buildPref, proxyConfig } = fetchCtx;
                            if(document.getElementById('editAdIdText')) document.getElementById('editAdIdText').innerText = `(#${ad.id})`;
                            if(document.getElementById('editAdPrice')) document.getElementById('editAdPrice').value = ad.price;
                            if(document.getElementById('editAdQuantity')) document.getElementById('editAdQuantity').value = ad.lastQuantity || ad.quantity;
                            if(document.getElementById('editAdMin')) document.getElementById('editAdMin').value = ad.minAmount;
                            if(document.getElementById('editAdMax')) document.getElementById('editAdMax').value = ad.maxAmount;
                            if(document.getElementById('editAdRemark')) document.getElementById('editAdRemark').value = ad.remark || "";
                            const assignedTier = window.getAdTier(itemId);
                            if(document.getElementById('editAdTierLabel')) document.getElementById('editAdTierLabel').innerText = `Mốc ${assignedTier}`;
                            windowEditAdContext = { ad, validPaymentIds, buildPref, proxyConfig };
                            if (editAdModal) editAdModal.show();
                        } catch(err) { showToast("Lỗi kết nối form sửa", "danger"); btnNode.disabled = false; btnNode.innerHTML = originalHtml; }
                    });
                });
            } else {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${data.message}</td></tr>`;
            }
        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Lỗi kết nối Server!</td></tr>`;
        }
    }

    const btnApplyTierData = document.getElementById('btnApplyTierData');
    if (btnApplyTierData) {
        btnApplyTierData.addEventListener('click', () => {
            if (!windowEditAdContext) return;
            const ad = windowEditAdContext.ad;
            const assignedTier = window.getAdTier(ad.id);
            const priceElId = ad.side === 0 ? `t${assignedTier}BuyP` : `t${assignedTier}SellP`;
            const priceDOM = document.getElementById(priceElId) || document.querySelector(`.sync-${priceElId}`);
            if (!priceDOM || !priceDOM.innerText || priceDOM.innerText === "..." || priceDOM.innerText === "NaN") return showToast(`Không có giá Mốc ${assignedTier}!`, "warning");
            const targetPriceFloat = parseFloat(priceDOM.innerText.replace(/,/g, '').trim());
            if (isNaN(targetPriceFloat)) return showToast(`Giá Mốc ${assignedTier} lỗi!`, "warning");
            const getVal = (id) => { const el = document.getElementById(id); return parseFloat(el && el.value ? el.value : (el && el.placeholder ? el.placeholder : 0)); };
            const tierMinUsdt = getVal(`tier${assignedTier}Min`);
            const tierMaxUsdt = getVal(`tier${assignedTier}Max`);
            document.getElementById('editAdPrice').value = targetPriceFloat.toString();
            document.getElementById('editAdMin').value = (tierMinUsdt * targetPriceFloat).toFixed(2);
            document.getElementById('editAdMax').value = (tierMaxUsdt * targetPriceFloat).toFixed(2);
            document.getElementById('editAdPrice').focus();
            showToast(`Đã áp Mốc ${assignedTier}!`, "success");
        });
    }

    const btnSubmitEdit = document.getElementById('btnSubmitEditAd');
    if (btnSubmitEdit) {
        btnSubmitEdit.addEventListener('click', async (e) => {
            if (!windowEditAdContext) return;
            const price = document.getElementById('editAdPrice') ? document.getElementById('editAdPrice').value.trim() : "";
            const quantity = document.getElementById('editAdQuantity') ? document.getElementById('editAdQuantity').value.trim() : "";
            const minAmount = document.getElementById('editAdMin') ? document.getElementById('editAdMin').value.trim() : "";
            const maxAmount = document.getElementById('editAdMax') ? document.getElementById('editAdMax').value.trim() : "";
            const remark = document.getElementById('editAdRemark') ? document.getElementById('editAdRemark').value.trim() : "";
            if(!price || !quantity || !minAmount || !maxAmount) return showToast("Nhập đủ thông tin!", "warning");
            const btn = e.currentTarget;
            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
            try {
                const { ad, validPaymentIds, buildPref, proxyConfig } = windowEditAdContext;
                const modifyPayload = {
                    id: ad.id.toString(), priceType: ad.priceType.toString(), premium: ad.premium ? ad.premium.toString() : "0",
                    price, minAmount, maxAmount, remark, tradingPreferenceSet: buildPref,
                    paymentIds: validPaymentIds, actionType: "MODIFY", quantity,
                    paymentPeriod: ad.paymentPeriod ? ad.paymentPeriod.toString() : "15"
                };
                const response = await fetch('/api/relist_ad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, item_id: ad.id, payload: modifyPayload }) });
                const data = await response.json();
                if (data.status === 'success') {
                    showToast("Cập nhật thành công!", "success");
                    if(editAdModal) editAdModal.hide();
                    loadMyAdsList(true);
                } else { showToast("Lỗi: " + data.message, "danger"); }
            } catch(err) { showToast("Lỗi kết nối!", "danger"); } finally { btn.disabled = false; btn.innerHTML = 'Lưu Thay Đổi'; }
        });
    }

    const btnLoadP = document.getElementById('btnLoadPayments');
    if (btnLoadP) {
        btnLoadP.addEventListener('click', async () => {
            const container = document.getElementById('paymentListContainer');
            if(!container) return;
            container.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin text-primary"></i> Đang tải...</div>';
            try {
                const proxyConfig = { ip: document.getElementById('proxyIp') ? document.getElementById('proxyIp').value.trim() : "", port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "", user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "", pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : "" };
                const response = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig }) });
                const data = await response.json();
                if (data.status === 'success') {
                    container.innerHTML = '';
                    const items = data.data || [];
                    if(items.length === 0) { container.innerHTML = '<div class="text-center text-muted">Tài khoản chưa có PTTT.</div>'; return; }
                    items.forEach(item => {
                        let payName = item.paymentConfigVo ? item.paymentConfigVo.paymentName : "Unknown";
                        if (!item.paymentConfigVo && typeof PAYMENT_METHODS !== 'undefined') payName = PAYMENT_METHODS[item.paymentType] || payName;
                        const div = document.createElement('div');
                        div.className = 'form-check mb-2 pb-1 border-bottom';
                        div.innerHTML = `<input class="form-check-input pay-checkbox" type="checkbox" value="${item.id}" id="pay_${item.id}">
                            <label class="form-check-label w-100" for="pay_${item.id}" style="font-size: 13px; cursor: pointer;">
                                <strong>${payName}</strong><span class="text-secondary">${item.accountNo?` - STK: ${item.accountNo}`:''}${item.bankName?` (${item.bankName})`:''}</span> 
                                <span class="badge bg-secondary float-end mt-1">ID: ${item.id}</span>
                            </label>`;
                        container.appendChild(div);
                    });
                    document.querySelectorAll('.pay-checkbox').forEach(cb => {
                        cb.addEventListener('change', () => {
                            if (document.querySelectorAll('.pay-checkbox:checked').length > 5) { cb.checked = false; showToast("Tối đa 5 PTTT!", "warning"); return; }
                            const payIdsEl = document.getElementById('adPaymentIds');
                            if(payIdsEl) payIdsEl.value = Array.from(document.querySelectorAll('.pay-checkbox:checked')).map(c => c.value).join(',');
                        });
                    });
                } else { container.innerHTML = `<div class="text-center text-danger">${data.message}</div>`; }
            } catch(e) { container.innerHTML = `<div class="text-center text-danger">Lỗi kết nối!</div>`; }
        });
    }

    const btnSubmitNewAd = document.getElementById('btnSubmitAd');
    if (btnSubmitNewAd) {
        btnSubmitNewAd.addEventListener('click', async () => {
            const $val = (id, def = "") => { const el = document.getElementById(id); return el ? (el.value || "").trim() : def; };
            const $checked = (id) => { const el = document.getElementById(id); return el ? !!el.checked : false; };
            const paymentsStr = $val('adPaymentIds');
            const payments = paymentsStr.split(',').map(s => s.trim()).filter(x => x);
            if (payments.length === 0) return showToast("Vui lòng chọn ít nhất 1 PTTT!", "warning");
            const hasUnPostAd = $checked('adHasUnPostAd') ? "1" : "0";
            const registerTime = $val('adRegisterTime', "0");
            const hasRegister = (registerTime && registerTime !== "0") ? "1" : "0";
            const orderFin30 = $val('adOrderFinishDay30', "0");
            const hasOrderFin = (orderFin30 && orderFin30 !== "0") ? "1" : "0";
            const completeRate = $val('adCompleteRateDay30', "0");
            const hasCompRate = (completeRate && completeRate !== "0") ? "1" : "0";
            const remark = $val('adRemark');
            const payload = {
                tokenId: ($val('adTokenId', "USDT")).toUpperCase(),
                currencyId: ($val('adCurrencyId', "KZT")).toUpperCase(),
                side: $val('adSide', "1"),
                priceType: "0", premium: "0",
                price: $val('adPrice'), minAmount: $val('adMinAmount'), maxAmount: $val('adMaxAmount'),
                remark, quantity: $val('adQuantity'),
                paymentPeriod: $val('adPaymentPeriod', "15"),
                itemType: "ORIGIN", paymentIds: payments,
                tradingPreferenceSet: {
                    hasUnPostAd, isKyc: "1", isEmail: "1", isMobile: "1",
                    hasRegisterTime: hasRegister,
                    registerTimeThreshold: hasRegister === "1" ? registerTime : "0",
                    hasOrderFinishNumberDay30: hasOrderFin,
                    orderFinishNumberDay30: hasOrderFin === "1" ? orderFin30 : "0",
                    hasCompleteRateDay30: hasCompRate,
                    completeRateDay30: hasCompRate === "1" ? completeRate : "0",
                    hasNationalLimit: "0", nationalLimit: ""
                }
            };
            if (!payload.price || !payload.quantity || !payload.minAmount || !payload.maxAmount) return showToast("Điền đủ Giá, Số lượng, Min, Max.", "warning");
            if (payload.side === "1") {
                const qtyNum = parseFloat(payload.quantity || 0);
                const availNum = parseFloat(window.adFundAvailValue || 0);
                if (availNum > 0 && qtyNum > availNum) {
                    addTerminalLog(`[CHẶN] Quantity ${qtyNum} > Funding ${availNum.toFixed(2)}`, 'danger');
                    return showToast(`Số lượng vượt quá khả dụng (${availNum.toFixed(2)} USDT)!`, "danger");
                }
            }
            btnSubmitNewAd.disabled = true;
            btnSubmitNewAd.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
            try {
                const proxyConfig = { ip: $val('proxyIp'), port: $val('proxyPort'), user: $val('proxyUser'), pass: $val('proxyPass') };
                addTerminalLog(`[Đăng QC] Side=${payload.side} Price=${payload.price} Qty=${payload.quantity}`, 'info');
                const response = await fetch('/api/post_ad', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig, payload })
                });
                const data = await response.json();
                if (data.status === 'success') {
                    addTerminalLog(`[Đăng QC OK] itemId=${data.data && data.data.itemId ? data.data.itemId : '?'}`, 'success');
                    showToast("Tạo quảng cáo thành công!", "success");
                    if (document.getElementById('adQuantity')) document.getElementById('adQuantity').value = "";
                } else {
                    addTerminalLog(`[Đăng QC LỖI] ${data.message || 'Không rõ'}`, 'danger');
                    if (data.raw) { try { addTerminalLog(`[RAW] ${JSON.stringify(data.raw).slice(0, 400)}`, 'danger'); } catch(_) {} }
                    showToast("Lỗi: " + data.message, "danger");
                }
            } catch(e) {
                addTerminalLog(`[Đăng QC] Lỗi kết nối: ${e.message}`, 'danger');
                showToast("Lỗi kết nối!", "danger");
            } finally {
                btnSubmitNewAd.disabled = false;
                btnSubmitNewAd.innerHTML = '<i class="fas fa-paper-plane"></i> ĐĂNG QUẢNG CÁO LÊN BYBIT';
            }
        });
    }

    const savedFreq = localStorage.getItem('market_ui_adUpdateFreq');
    document.querySelectorAll('.sync-adUpdateFreq').forEach(el => {
        if(savedFreq) el.value = savedFreq;
        el.addEventListener('change', (e) => {
            const val = e.target.value;
            localStorage.setItem('market_ui_adUpdateFreq', val);
            document.querySelectorAll('.sync-adUpdateFreq').forEach(syncEl => { syncEl.value = val; });
        });
    });
    // ===========================================================
    // === MENU NHANH: Đăng QC theo Mốc / Cả 3 Mốc / Tùy chọn ====
    // ===========================================================

    // Helper: lấy proxy
    function _getProxyConfig() {
        return {
            ip:   document.getElementById('proxyIp')   ? document.getElementById('proxyIp').value.trim()   : "",
            port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "",
            user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "",
            pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : ""
        };
    }

    // Helper: đợi điều kiện
    function _waitFor(condFn, timeoutMs = 8000, interval = 200) {
        return new Promise((resolve) => {
            const start = Date.now();
            const t = setInterval(() => {
                if (condFn()) { clearInterval(t); resolve(true); }
                else if (Date.now() - start > timeoutMs) { clearInterval(t); resolve(false); }
            }, interval);
        });
    }

    // Đảm bảo có danh sách PTTT đã load + đã tick Freedom -> trả về paymentIds
    async function _ensureFreedomPayments() {
        const container = document.getElementById('paymentListContainer');
        if (!container || !container.querySelector('.pay-checkbox')) {
            const btnLoad = document.getElementById('btnLoadPayments');
            if (btnLoad) btnLoad.click();
            await _waitFor(() => container && container.querySelector('.pay-checkbox'), 10000);
        }
        // tick Freedom nếu chưa
        const payIdsEl = document.getElementById('adPaymentIds');
        let cur = payIdsEl ? (payIdsEl.value || '').split(',').map(s => s.trim()).filter(x => x) : [];
        if (cur.length === 0) {
            window.autoSelectPaymentByName('freedom');
            cur = payIdsEl ? (payIdsEl.value || '').split(',').map(s => s.trim()).filter(x => x) : [];
        }
        return cur.slice(0, 5);
    }

        // === Loading overlay ===
    function _showQuickLoading(text) {
        let ov = document.getElementById('quickPostOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'quickPostOverlay';
            ov.innerHTML = `
                <div class="qpo-box">
                    <div class="qpo-spinner"><i class="fas fa-spinner fa-spin"></i></div>
                    <div class="qpo-text" id="quickPostOverlayText">Đang xử lý...</div>
                    <div class="qpo-sub" id="quickPostOverlaySub"></div>
                </div>
            `;
            document.body.appendChild(ov);
            const st = document.createElement('style');
            st.innerHTML = `
                #quickPostOverlay {
                    position: fixed; inset: 0;
                    background: rgba(15,23,42,.55);
                    backdrop-filter: blur(3px);
                    z-index: 999999;
                    display: flex; align-items: center; justify-content: center;
                    animation: qpoFade .15s ease both;
                }
                @keyframes qpoFade { from{opacity:0} to{opacity:1} }
                #quickPostOverlay .qpo-box {
                    background: #fff; border-radius: 16px;
                    padding: 32px 44px; min-width: 340px; text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,.3);
                }
                #quickPostOverlay .qpo-spinner { font-size: 38px; color: #2563eb; margin-bottom: 14px; }
                #quickPostOverlay .qpo-text { font-size: 17px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
                #quickPostOverlay .qpo-sub { font-size: 13px; color: #64748b; min-height: 18px; }
                #quickPostOverlay.qpo-success .qpo-spinner { color: #16a34a; }
                #quickPostOverlay.qpo-error .qpo-spinner { color: #dc2626; }
            `;
            document.head.appendChild(st);
        }
        ov.classList.remove('qpo-success', 'qpo-error');
        const txtEl = document.getElementById('quickPostOverlayText');
        const subEl = document.getElementById('quickPostOverlaySub');
        if (txtEl) txtEl.innerText = text || 'Đang xử lý...';
        if (subEl) subEl.innerText = '';
        ov.querySelector('.qpo-spinner').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        ov.style.display = 'flex';
    }
    function _updateQuickLoading(text, sub) {
        const txtEl = document.getElementById('quickPostOverlayText');
        const subEl = document.getElementById('quickPostOverlaySub');
        if (text && txtEl) txtEl.innerText = text;
        if (subEl) subEl.innerText = sub || '';
    }
    function _showQuickResult(success, title, subText, autoCloseMs = 1800) {
        const ov = document.getElementById('quickPostOverlay');
        if (!ov) return;
        ov.classList.remove('qpo-success', 'qpo-error');
        ov.classList.add(success ? 'qpo-success' : 'qpo-error');
        ov.querySelector('.qpo-spinner').innerHTML = success
            ? '<i class="fas fa-check-circle"></i>'
            : '<i class="fas fa-times-circle"></i>';
        const txtEl = document.getElementById('quickPostOverlayText');
        const subEl = document.getElementById('quickPostOverlaySub');
        if (txtEl) txtEl.innerText = title;
        if (subEl) subEl.innerText = subText || '';
        if (autoCloseMs > 0) setTimeout(_hideQuickLoading, autoCloseMs);
    }
    function _hideQuickLoading() {
        const ov = document.getElementById('quickPostOverlay');
        if (ov) ov.style.display = 'none';
    }
    function _silentReloadAdsList() {
        if (typeof loadMyAdsList === 'function') {
            try { loadMyAdsList(true); } catch(_) {}
        }
    }

    // Hàm đăng QC nhanh theo (side, tier) — TRẢ VỀ {ok, msg}
    window.quickPostAd = async function(side, tier) {
        try {
            const paymentIds = await _ensureFreedomPayments();
            if (!paymentIds.length) {
                addTerminalLog(`[QUICK ${side==="0"?"MUA":"BÁN"} Mốc ${tier}] LỖI: Không có PTTT Freedom`, 'danger');
                return { ok: false, msg: 'Không tìm thấy PTTT Freedom' };
            }
            const priceElId = side === "0" ? `t${tier}BuyP` : `t${tier}SellP`;
            const priceDOM = document.getElementById(priceElId) || document.querySelector(`.sync-${priceElId}`);
            if (!priceDOM || !priceDOM.innerText || priceDOM.innerText === "..." || priceDOM.innerText === "NaN") {
                return { ok: false, msg: `Chưa có giá Mốc ${tier}` };
            }
            const priceFloat = parseFloat(priceDOM.innerText.replace(/,/g, '').trim());
            if (isNaN(priceFloat) || priceFloat <= 0) return { ok: false, msg: `Giá Mốc ${tier} không hợp lệ` };

            const getNum = (id) => {
                const el = document.getElementById(id);
                if (!el) return 0;
                const v = parseFloat(el.value || el.placeholder || 0);
                return isNaN(v) ? 0 : v;
            };
            const tierMinUsdt = getNum(`tier${tier}Min`);
            const tierMaxUsdt = getNum(`tier${tier}Max`);
            if (tierMinUsdt <= 0 || tierMaxUsdt <= 0) return { ok: false, msg: `Chưa cấu hình Min/Max Mốc ${tier}` };
            const minAmount = (tierMinUsdt * priceFloat).toFixed(2);
            const maxAmount = (tierMaxUsdt * priceFloat).toFixed(2);

            let quantity = "0";
            if (side === "0") {
                const kzt = window.getFreedomKztBalance();
                if (kzt <= 0) return { ok: false, msg: 'Không có số dư KZT Freedom' };
                quantity = (Math.floor((kzt / priceFloat) * 100) / 100).toFixed(2);
            } else {
                await window.loadAdFundBalance();
                if (!window.adFundAvailValue || window.adFundAvailValue <= 0) return { ok: false, msg: 'Không có số dư USDT Funding' };
                quantity = (Math.floor(window.adFundAvailValue * 100) / 100).toFixed(2);
            }

            let remark = "";
            const idx = window.getDefaultRemarkIndex();
            if (idx >= 0) {
                const list = window.getSavedRemarks();
                if (list[idx]) remark = list[idx].content;
            }

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

            addTerminalLog(`[QUICK ${side==="0"?"MUA":"BÁN"} Mốc ${tier}] Price=${priceFloat} Qty=${quantity}`, 'info');

            const response = await fetch('/api/post_ad', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    group: currentGroup, account_index: selectedAccountIndex,
                    proxy: _getProxyConfig(), payload: payload
                })
            });
            const data = await response.json();
            if (data.status === 'success') {
                const itemId = data.data && data.data.itemId ? data.data.itemId : null;
                addTerminalLog(`[QUICK OK] ${side==="0"?"MUA":"BÁN"} Mốc ${tier} → itemId=${itemId || '?'}`, 'success');

                // ✅ GÁN MỐC + BẬT AUTO UPDATE cho QC vừa tạo
                if (itemId) {
                    const adIdStr = itemId.toString();
                    // 1) Gán đúng Mốc đã chọn
                    window.setAdTier(adIdStr, tier.toString());
                    addTerminalLog(`[QUICK] Đã gán Ad ${adIdStr} theo MỐC ${tier}`, 'info');

                    // 2) Bật Auto Update
                    let curSet = window.getAutoUpdateAds();
                    curSet.add(adIdStr);
                    window.setAutoUpdateAds(curSet);
                    addTerminalLog(`[QUICK] Đã BẬT Auto Update cho Ad ${adIdStr}`, 'success');
                }

                return { ok: true, msg: `itemId=${itemId || '?'} | Mốc ${tier} | Auto ON` };
            } else {
                addTerminalLog(`[QUICK LỖI] ${side==="0"?"MUA":"BÁN"} Mốc ${tier}: ${data.message || '?'}`, 'danger');
                if (data.raw) { try { addTerminalLog(`[RAW] ${JSON.stringify(data.raw).slice(0,400)}`, 'danger'); } catch(_){} }
                return { ok: false, msg: data.message || 'Lỗi không rõ' };
            }
        } catch(e) {
            addTerminalLog(`[QUICK LỖI KẾT NỐI] ${e.message || e}`, 'danger');
            return { ok: false, msg: 'Lỗi kết nối: ' + (e.message || e) };
        }
    };

    // === Build popup menu ===
    (function buildQuickMenu() {
        const tab = document.querySelector('#adsSubTabs .nav-link[data-target="postAdForm"]');
        if (!tab) return;

        // Clone để hủy listener cũ
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);

        // Build menu
        const menu = document.createElement('div');
        menu.id = 'postAdQuickMenu';
        menu.innerHTML = `
            <div class="qa-item" data-group="sell">
                <span><i class="fas fa-arrow-up text-danger me-2"></i>Quảng cáo BÁN</span>
                <i class="fas fa-chevron-right text-muted"></i>
                <div class="qa-sub">
                    <div class="qa-sub-item" data-side="1" data-tier="1"><i class="fas fa-tag text-info me-2"></i>Bán theo Mốc 1</div>
                    <div class="qa-sub-item" data-side="1" data-tier="2"><i class="fas fa-tag text-warning me-2"></i>Bán theo Mốc 2</div>
                    <div class="qa-sub-item" data-side="1" data-tier="3"><i class="fas fa-tag text-success me-2"></i>Bán theo Mốc 3</div>
                    <div class="qa-divider"></div>
                    <div class="qa-sub-item qa-multi" data-side="1" data-tier="all"><i class="fas fa-layer-group text-primary me-2"></i>Đăng BÁN cả 3 Mốc</div>
                    <div class="qa-divider"></div>
                    <div class="qa-sub-item qa-custom" data-side="1" data-tier="custom"><i class="fas fa-cog text-secondary me-2"></i>Tùy chọn (mở form)</div>
                </div>
            </div>
            <div class="qa-item" data-group="buy">
                <span><i class="fas fa-arrow-down text-success me-2"></i>Quảng cáo MUA</span>
                <i class="fas fa-chevron-right text-muted"></i>
                <div class="qa-sub">
                    <div class="qa-sub-item" data-side="0" data-tier="2"><i class="fas fa-tag text-warning me-2"></i>Mua theo Mốc 2</div>
                    <div class="qa-divider"></div>
                    <div class="qa-sub-item qa-custom" data-side="0" data-tier="custom"><i class="fas fa-cog text-secondary me-2"></i>Tùy chọn (mở form)</div>
                </div>
            </div>
        `;
        document.body.appendChild(menu);

        // CSS
        const style = document.createElement('style');
        style.innerHTML = `
            #postAdQuickMenu {
                position: absolute;
                z-index: 99999;
                background: #fff;
                border: 1.5px solid #e2e8f0;
                border-radius: 12px;
                box-shadow: 0 12px 40px rgba(0,0,0,.15);
                padding: 6px;
                min-width: 240px;
                display: none;
                animation: qaFade .15s ease both;
            }
            @keyframes qaFade {
                from { opacity: 0; transform: translateY(-6px); }
                to { opacity: 1; transform: translateY(0); }
            }
            #postAdQuickMenu .qa-item {
                position: relative;
                padding: 11px 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                font-weight: 600;
                font-size: 14px;
                border-radius: 8px;
                color: #1e293b;
                transition: all .12s;
            }
            #postAdQuickMenu .qa-item:hover {
                background: linear-gradient(135deg, #f0f9ff, #ecfeff);
                color: #0c4a6e;
            }
            #postAdQuickMenu .qa-item:hover .qa-sub,
            #postAdQuickMenu .qa-sub:hover { display: block; }
            #postAdQuickMenu .qa-sub {
                display: none;
                position: absolute;
                top: -6px;
                left: calc(100% - 2px);
                background: #fff;
                border: 1.5px solid #e2e8f0;
                border-radius: 12px;
                box-shadow: 0 12px 40px rgba(0,0,0,.15);
                padding: 6px;
                min-width: 230px;
            }
            /* Cầu nối vô hình giữa item cha và submenu để di chuột không rớt */
            #postAdQuickMenu .qa-item::after {
                content: "";
                position: absolute;
                top: 0;
                right: -14px;
                width: 14px;
                height: 100%;
                background: transparent;
            }
            #postAdQuickMenu .qa-sub-item {
                padding: 9px 12px;
                cursor: pointer;
                font-size: 13.5px;
                border-radius: 6px;
                font-weight: 500;
                color: #334155;
                transition: all .12s;
                display: flex;
                align-items: center;
            }
            #postAdQuickMenu .qa-sub-item:hover {
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                color: #fff;
                transform: translateX(2px);
            }
            #postAdQuickMenu .qa-sub-item:hover i { color: #fff !important; }
            #postAdQuickMenu .qa-sub-item.qa-multi {
                background: #fef3c7;
                color: #78350f;
                font-weight: 700;
            }
            #postAdQuickMenu .qa-sub-item.qa-multi:hover {
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: #fff;
            }
            #postAdQuickMenu .qa-sub-item.qa-custom {
                background: #f1f5f9;
                font-style: italic;
            }
            #postAdQuickMenu .qa-divider {
                height: 1px;
                background: #e2e8f0;
                margin: 4px 6px;
            }
        `;
        document.head.appendChild(style);

        // Mở form như cũ (cho "Tùy chọn")
        function openPostAdForm(side) {
            document.querySelectorAll('#adsSubTabs .nav-link').forEach(t => t.classList.remove('active'));
            newTab.classList.add('active');
            if (document.getElementById('postAdForm')) document.getElementById('postAdForm').classList.remove('d-none');
            if (document.getElementById('myAdsList')) document.getElementById('myAdsList').classList.add('d-none');

            // Trigger các default
            if (typeof window.injectFundUI === 'function') window.injectFundUI();
            if (typeof window.loadAdFundBalance === 'function') window.loadAdFundBalance();
            if (typeof window.autoLoadPaymentsAndPickFreedom === 'function') window.autoLoadPaymentsAndPickFreedom();
            window.postFormDefaultsApplied = false; // reset để áp lại
            setTimeout(() => {
                window.applyAllPostFormDefaults();
                // Set side theo lựa chọn
                const sideSel = document.getElementById('adSide');
                if (sideSel && side) {
                    sideSel.value = side;
                    sideSel.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, 300);
        }

        // Show menu khi click tab
        newTab.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = newTab.getBoundingClientRect();
            menu.style.top = (rect.bottom + window.scrollY + 4) + 'px';
            menu.style.left = (rect.left + window.scrollX) + 'px';
            menu.style.display = 'block';
        });

        // Click ngoài -> ẩn
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== newTab) menu.style.display = 'none';
        });

            // === Hàm batch: gom nhiều mốc, gửi 1 lần lên server, server bắn song song ===
    window.quickPostAdsBatch = async function(side, tiers) {
        const sideName = side === "0" ? "MUA" : "BÁN";
        try {
            // 1) Đảm bảo PTTT Freedom
            const paymentIds = await _ensureFreedomPayments();
            if (!paymentIds.length) {
                return { okCount: 0, summary: 'Không tìm thấy PTTT Freedom', results: [] };
            }

            // 2) Lấy số dư 1 lần (dùng chung cho tất cả mốc)
            let kztBalance = 0, fundBalance = 0;
            if (side === "0") {
                kztBalance = window.getFreedomKztBalance();
                if (kztBalance <= 0) return { okCount: 0, summary: 'Không có số dư KZT Freedom', results: [] };
            } else {
                await window.loadAdFundBalance();
                fundBalance = window.adFundAvailValue || 0;
                if (fundBalance <= 0) return { okCount: 0, summary: 'Không có số dư USDT Funding', results: [] };
            }

            // 3) Remark mặc định
            let remark = "";
            const idx = window.getDefaultRemarkIndex();
            if (idx >= 0) {
                const list = window.getSavedRemarks();
                if (list[idx]) remark = list[idx].content;
            }

            // 4) Build từng item
            const items = [];
            const skipped = [];
            for (const tier of tiers) {
                const priceElId = side === "0" ? `t${tier}BuyP` : `t${tier}SellP`;
                const priceDOM = document.getElementById(priceElId) || document.querySelector(`.sync-${priceElId}`);
                if (!priceDOM || !priceDOM.innerText || priceDOM.innerText === "..." || priceDOM.innerText === "NaN") {
                    skipped.push(`Mốc ${tier}: thiếu giá`);
                    continue;
                }
                const priceFloat = parseFloat(priceDOM.innerText.replace(/,/g, '').trim());
                if (isNaN(priceFloat) || priceFloat <= 0) {
                    skipped.push(`Mốc ${tier}: giá lỗi`);
                    continue;
                }
                const getNum = (id) => {
                    const el = document.getElementById(id);
                    if (!el) return 0;
                    const v = parseFloat(el.value || el.placeholder || 0);
                    return isNaN(v) ? 0 : v;
                };
                const tMin = getNum(`tier${tier}Min`);
                const tMax = getNum(`tier${tier}Max`);
                if (tMin <= 0 || tMax <= 0) {
                    skipped.push(`Mốc ${tier}: thiếu Min/Max`);
                    continue;
                }
                const minAmount = (tMin * priceFloat).toFixed(2);
                const maxAmount = (tMax * priceFloat).toFixed(2);

                let quantity;
                if (side === "0") {
                    quantity = (Math.floor((kztBalance / priceFloat) * 100) / 100).toFixed(2);
                } else {
                    quantity = (Math.floor(fundBalance * 100) / 100).toFixed(2);
                }

                items.push({
                    tag: tier.toString(),
                    payload: {
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
                    }
                });
            }

            if (items.length === 0) {
                return { okCount: 0, summary: 'Không có mốc hợp lệ. ' + skipped.join(' | '), results: [] };
            }

            addTerminalLog(`[BATCH] Gửi ${items.length} mốc ${sideName} lên server (đa luồng)...`, 'info');

            // 5) Gọi 1 lần duy nhất lên server -> server bắn song song
            const response = await fetch('/api/post_ads_batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    group: currentGroup,
                    account_index: selectedAccountIndex,
                    proxy: _getProxyConfig(),
                    items: items
                })
            });
            const data = await response.json();

            if (data.status !== 'success') {
                return { okCount: 0, summary: 'Server lỗi: ' + (data.message || '?'), results: [] };
            }

            const results = data.results || [];
            let okCount = 0;
            const summaries = [];

            for (const r of results) {
                const tier = r.tag;
                if (r.ok && r.itemId) {
                    okCount++;
                    summaries.push(`Mốc ${tier}: ✓ #${r.itemId}`);
                    addTerminalLog(`[BATCH OK] ${sideName} Mốc ${tier} → itemId=${r.itemId}`, 'success');

                    // Gán Mốc + bật Auto Update
                    const adIdStr = r.itemId.toString();
                    window.setAdTier(adIdStr, tier.toString());
                    let curSet = window.getAutoUpdateAds();
                    curSet.add(adIdStr);
                    window.setAutoUpdateAds(curSet);
                    addTerminalLog(`[BATCH] Ad ${adIdStr} → Mốc ${tier} + Auto ON`, 'info');
                } else {
                    summaries.push(`Mốc ${tier}: ✗ ${r.message || '?'}`);
                    addTerminalLog(`[BATCH LỖI] ${sideName} Mốc ${tier}: ${r.message}`, 'danger');
                }
            }
            for (const sk of skipped) summaries.push(sk);

            return {
                okCount,
                summary: summaries.join(' | '),
                results
            };
        } catch(e) {
            addTerminalLog(`[BATCH] Lỗi kết nối: ${e.message || e}`, 'danger');
            return { okCount: 0, summary: 'Lỗi kết nối: ' + (e.message || e), results: [] };
        }
    };
        // Bắt click sub-item
        menu.querySelectorAll('.qa-sub-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                menu.style.display = 'none';
                const side = item.dataset.side;
                const tier = item.dataset.tier;
                const sideName = side === "0" ? "MUA" : "BÁN";

                if (tier === 'custom') {
                    openPostAdForm(side);
                    return;
                }

                if (tier === 'all') {
                    _showQuickLoading(`Đang đăng SONG SONG cả 3 Mốc ${sideName}...`);
                    _updateQuickLoading(null, 'Server đang xử lý đa luồng, vui lòng chờ...');
                    const r = await window.quickPostAdsBatch(side, ['1', '2', '3']);
                    _silentReloadAdsList();
                    _showQuickResult(
                        r.okCount === 3,
                        `Hoàn tất ${r.okCount}/3 Mốc`,
                        r.summary,
                        r.okCount === 3 ? 1800 : 4500
                    );
                    return;
                }

                // Single mốc
                _showQuickLoading(`Đang đăng QC ${sideName} Mốc ${tier}...`);
                const r = await window.quickPostAd(side, tier);
                _silentReloadAdsList();
                _showQuickResult(
                    r.ok,
                    r.ok ? `Đăng ${sideName} Mốc ${tier} thành công!` : `Lỗi đăng ${sideName} Mốc ${tier}`,
                    r.msg,
                    r.ok ? 1500 : 4000
                );
            });
        });
    })();
    // === END Quick Menu ===
});
