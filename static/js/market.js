document.addEventListener('DOMContentLoaded', () => {
    // Biến lưu trữ dữ liệu P2P
    window.allBuyAdsData = [];  
    window.allSellAdsData = []; 
    window.filteredBuyAds = [];
    window.filteredSellAds = [];
    
    let currentPage = 1;
    const itemsPerPage = 10;
    let marketRefreshInterval = null;
    let typingTimer = null; 
    let activeTierFilter = 0; 
    
    // --- HÀM SYNC TEXT (Đồng bộ thông tin sang tab khác) ---
    function syncText(idOrClass, text) {
        const el = document.getElementById(idOrClass);
        if (el) el.innerText = text;
        document.querySelectorAll('.sync-' + idOrClass).forEach(e => e.innerText = text);
    }

    // --- KHÔI PHỤC TRẠNG THÁI UI TỪ LOCAL STORAGE KHI LOAD TRANG ---
    function loadMarketUIState() {
        const uiFields = ['tier1Min', 'tier1Max', 'tier2Min', 'tier2Max', 'tier3Min', 'tier3Max', 'toggleShowAllAds', 'filterDeltaX', 'filterPayment', 'filterMargin'];
        uiFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const savedVal = localStorage.getItem('market_ui_' + id);
                if (savedVal !== null) {
                    if (el.type === 'checkbox') {
                        el.checked = (savedVal === 'true');
                    } else {
                        el.value = savedVal;
                    }
                }
            }
        });
    }
    loadMarketUIState(); 

    // --- LƯU TRẠNG THÁI UI VÀO LOCAL STORAGE ---
    function saveMarketUIState() {
        const uiFields = ['tier1Min', 'tier1Max', 'tier2Min', 'tier2Max', 'tier3Min', 'tier3Max', 'toggleShowAllAds', 'filterDeltaX', 'filterPayment', 'filterMargin'];
        uiFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') {
                    localStorage.setItem('market_ui_' + id, el.checked);
                } else {
                    localStorage.setItem('market_ui_' + id, el.value);
                }
            }
        });
    }

    function setupAutoRefresh() {
        if (marketRefreshInterval) clearInterval(marketRefreshInterval);
        const selectEl = document.getElementById('autoRefreshSelect');
        if (!selectEl) return;
        
        const seconds = parseInt(selectEl.value);
        if (seconds > 0) {
            marketRefreshInterval = setInterval(() => {
                if (selectedAccountIndex !== null && document.getElementById('configArea') && !document.getElementById('configArea').classList.contains('locked-overlay')) {
                    return; 
                }
                if (selectedAccountIndex !== null) {
                    fetchP2PData(true);
                }
            }, seconds * 1000);
        }
    }

    const autoSaveAndApply = () => {
        clearTimeout(typingTimer);
        saveMarketUIState(); 
        
        typingTimer = setTimeout(async () => {
            const isUILocked = document.getElementById('configArea') && document.getElementById('configArea').classList.contains('locked-overlay');
            if (typeof getFullConfigState === 'function') {
                try {
                    await fetch('/api/config', { 
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getFullConfigState(isUILocked)) 
                    });
                } catch(e) {}
            }
            applyFiltersAndRender();
        }, 500); 
    };

    const filterInputs = [
        'filterDeltaX', 'filterPayment', 'filterMargin',
        'tier1Min', 'tier1Max', 'tier2Min', 'tier2Max', 'tier3Min', 'tier3Max'
    ];
    filterInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', autoSaveAndApply); 
    });

    const selectAuto = document.getElementById('autoRefreshSelect');
    if (selectAuto) {
        selectAuto.addEventListener('change', () => { autoSaveAndApply(); setupAutoRefresh(); });
    }

    const toggleShowAll = document.getElementById('toggleShowAllAds');
    if (toggleShowAll) {
        toggleShowAll.addEventListener('change', () => {
            saveMarketUIState(); 
            currentPage = 1; 
            renderPage(); 
        });
    }

    // --- SỰ KIỆN NÚT LỌC MỐC ---
    document.querySelectorAll('.btn-tier-filter').forEach(btn => {
        btn.addEventListener('click', function() {
            const tier = parseInt(this.getAttribute('data-tier'));
            
            if (activeTierFilter === tier) {
                activeTierFilter = 0; 
                this.classList.remove('active', 'btn-primary');
                this.classList.add('btn-outline-primary');
                this.innerHTML = `<i class="fas fa-filter"></i> Xem đối thủ`;
            } else {
                activeTierFilter = tier; 
                document.querySelectorAll('.btn-tier-filter').forEach(b => {
                    b.classList.remove('active', 'btn-primary');
                    b.classList.add('btn-outline-primary');
                    b.innerHTML = `<i class="fas fa-filter"></i> Xem đối thủ`;
                });
                
                this.classList.remove('btn-outline-primary');
                this.classList.add('active', 'btn-primary');
                this.innerHTML = `<i class="fas fa-eye"></i> Đang soi mốc ${tier}`;
            }
            
            currentPage = 1;
            renderPage(); 
        });
    });

    setupAutoRefresh();

    if (SERVER_CONFIG && SERVER_CONFIG.is_locked) {
        fetchP2PData(true);
    }

    if (!isAdsTab) {
        document.querySelectorAll('#tradeTabs .nav-link').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('#tradeTabs .nav-link').forEach(t => t.classList.remove('active'));
                e.target.closest('.nav-link').classList.add('active');
                currentSide = e.target.closest('.nav-link').dataset.side;
                currentPage = 1; 
                renderPage(); 
            });
        });

        document.getElementById('refreshMarketBtn').addEventListener('click', () => {
            fetchP2PData(false);
            autoSaveAndApply(); 
        });
    }

    async function fetchP2PData(isBackground = false) {
        const proxyConfig = {
            ip: document.getElementById('proxyIp').value.trim(), port: document.getElementById('proxyPort').value.trim(),
            user: document.getElementById('proxyUser').value.trim(), pass: document.getElementById('proxyPass').value.trim()
        };

        const bgLoadingSpinner = document.getElementById('bgLoadingSpinner');
        const lastUpdateTimeText = document.getElementById('lastUpdateTimeText');

        if (!isBackground && !isAdsTab) {
            document.getElementById('p2pTableBody').innerHTML = '<tr><td colspan="4" class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i><p class="mt-2">Đang tải dữ liệu...</p></td></tr>';
            document.getElementById('paginationControls').innerHTML = '';
            if (lastUpdateTimeText) lastUpdateTimeText.innerText = "Đang tải...";
        } else {
            if (bgLoadingSpinner) bgLoadingSpinner.classList.remove('d-none');
        }

        try {
            const baseBody = { group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig };
            const [res0, res1] = await Promise.all([
                fetch('/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...baseBody, side: "0"}) }),
                fetch('/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...baseBody, side: "1"}) })
            ]);
            const data0 = await res0.json();
            const data1 = await res1.json();
            
            if (data0.status === 'success' && data1.status === 'success') {
                window.allBuyAdsData = data0.data;   
                window.allSellAdsData = data1.data;  
                
                if (!isBackground) currentPage = 1;
                applyFiltersAndRender();
                
                const now = new Date();
                if (lastUpdateTimeText) {
                    lastUpdateTimeText.innerText = "Cập nhật: " + now.toLocaleTimeString('vi-VN', { hour12: false });
                }
            }
        } catch (err) {} finally {
            if (bgLoadingSpinner) bgLoadingSpinner.classList.add('d-none');
        }
    }

    function filterAdsList(adsArray) {
        const deltaX_Str = document.getElementById('filterDeltaX') ? document.getElementById('filterDeltaX').value.trim() : "";
        const payText = document.getElementById('filterPayment') ? document.getElementById('filterPayment').value.trim().toLowerCase() : "";
        const deltaX = deltaX_Str ? parseFloat(deltaX_Str) : 0;

        return adsArray.filter(ad => {
            const price = parseFloat(ad.price);
            const minUSDT = parseFloat(ad.minAmount) / price;
            const maxUSDT = parseFloat(ad.maxAmount) / price;
            const delta = maxUSDT - minUSDT;

            ad._passedFilter = true;
            ad._filterReason = "";

            if (deltaX_Str && delta < deltaX) {
                ad._passedFilter = false;
                ad._filterReason = `Biên độ quá hẹp (< ${deltaX})`;
                return false;
            }

            if (payText) {
                let hasMatchingPay = false;
                if (ad.payments && Array.isArray(ad.payments)) {
                    for (let payId of ad.payments) {
                        const payName = (typeof PAYMENT_METHODS !== 'undefined' && PAYMENT_METHODS[payId] ? PAYMENT_METHODS[payId] : `Bank Transfer (${payId})`).toLowerCase();
                        if (payName.includes(payText)) { hasMatchingPay = true; break; }
                    }
                }
                if (!hasMatchingPay) {
                    ad._passedFilter = false;
                    ad._filterReason = "Khác PTTT";
                    return false;
                }
            }
            return true;
        });
    }

    function calculateTier(tierMin, tierMax, desiredMargin, tickSize, maxDecimals, pBuyElem, pSellElem, marginElem, rankBuyElem, rankSellElem, errElem) {
        const validSells = window.filteredSellAds.filter(ad => {
            const p = parseFloat(ad.price); 
            const minU = parseFloat(ad.minAmount) / p;
            const maxU = parseFloat(ad.maxAmount) / p;
            return (maxU >= tierMin && minU <= tierMax); 
        });
        
        const validBuys = window.filteredBuyAds.filter(ad => {
            const p = parseFloat(ad.price); 
            const minU = parseFloat(ad.minAmount) / p;
            const maxU = parseFloat(ad.maxAmount) / p;
            return (maxU >= tierMin && minU <= tierMax); 
        });

        let validPairs = [];
        for (let s = 0; s < validSells.length; s++) {
            for (let b = 0; b < validBuys.length; b++) {
                const competitorSell = parseFloat(validSells[s].price);
                const competitorBuy = parseFloat(validBuys[b].price);
                const mySellPrice = competitorSell - tickSize;
                const myBuyPrice = competitorBuy + tickSize;
                const actualMargin = (mySellPrice - myBuyPrice) / myBuyPrice;
                
                if (actualMargin >= desiredMargin) {
                    validPairs.push({ s: s, b: b, pSell: mySellPrice, pBuy: myBuyPrice, margin: actualMargin * 100 });
                }
            }
        }

        if (validPairs.length > 0) {
            validPairs.sort((pairA, pairB) => {
                const diffA = Math.abs(pairA.s - pairA.b);
                const diffB = Math.abs(pairB.s - pairB.b);
                if (diffA !== diffB) return diffA - diffB;
                if (pairA.s !== pairB.s) return pairA.s - pairB.s; 
                return pairA.b - pairB.b;
            });
            
            const bestPair = validPairs[0];
            
            syncText(pSellElem, bestPair.pSell.toLocaleString(undefined, {minimumFractionDigits: maxDecimals, maximumFractionDigits: maxDecimals}));
            syncText(pBuyElem, bestPair.pBuy.toLocaleString(undefined, {minimumFractionDigits: maxDecimals, maximumFractionDigits: maxDecimals}));
            syncText(marginElem, bestPair.margin.toFixed(3) + '%');
            syncText(rankBuyElem, bestPair.b + 1);
            syncText(rankSellElem, bestPair.s + 1);
            syncText(errElem, "");
            
            return { buy: bestPair.pBuy, sell: bestPair.pSell };
        } else {
            syncText(pSellElem, "..."); 
            syncText(pBuyElem, "...");
            syncText(marginElem, "..."); 
            syncText(rankBuyElem, "-"); 
            syncText(rankSellElem, "-");
            syncText(errElem, "Không có cặp giá thỏa mãn");
            return null;
        }
    }

    function calculateRecommendations() {
        const marginStr = document.getElementById('filterMargin') ? document.getElementById('filterMargin').value.trim() : "";
        const deltaStr = document.getElementById('filterDeltaX') ? document.getElementById('filterDeltaX').value.trim() : "";
        const payStr = document.getElementById('filterPayment') ? document.getElementById('filterPayment').value.trim() : "";
        const recPanel = document.getElementById('recommendationPanel');

        syncText('filterDelta', deltaStr || '0');
        syncText('filterPay', payStr || 'Tất cả');
        syncText('filterMargin', marginStr || '0');

        if (!marginStr || window.filteredSellAds.length === 0 || window.filteredBuyAds.length === 0) {
            if (recPanel) recPanel.classList.add('d-none'); return;
        }
        
        if (recPanel) recPanel.classList.remove('d-none');
        const desiredMargin = parseFloat(marginStr) / 100;

        let maxDecimals = 0;
        [...window.filteredBuyAds, ...window.filteredSellAds].forEach(ad => {
            const parts = String(ad.price).split('.');
            if (parts.length > 1 && parts[1].length > maxDecimals) maxDecimals = parts[1].length;
        });
        
        let tickSize = maxDecimals > 0 ? Math.pow(10, -maxDecimals) : 1;

        const getVal = (id) => {
            const el = document.getElementById(id);
            return parseFloat(el && el.value ? el.value : (el && el.placeholder ? el.placeholder : 0));
        };

        const t1Min = getVal('tier1Min'); const t1Max = getVal('tier1Max');
        const t2Min = getVal('tier2Min'); const t2Max = getVal('tier2Max');
        const t3Min = getVal('tier3Min'); const t3Max = getVal('tier3Max');

        // ĐỒNG BỘ CHỮ NHÃN MỐC SANG TẤT CẢ CÁC TAB
        syncText('t1Label', `MỐC 1: ${t1Min} - ${t1Max} USDT`);
        syncText('t2Label', `MỐC 2: ${t2Min} - ${t2Max} USDT`);
        syncText('t3Label', `MỐC 3: ${t3Min} - ${t3Max} USDT`);

        calculateTier(t1Min, t1Max, desiredMargin, tickSize, maxDecimals, 't1BuyP', 't1SellP', 't1Margin', 't1BuyR', 't1SellR', 't1Err');
        calculateTier(t2Min, t2Max, desiredMargin, tickSize, maxDecimals, 't2BuyP', 't2SellP', 't2Margin', 't2BuyR', 't2SellR', 't2Err');
        calculateTier(t3Min, t3Max, desiredMargin, tickSize, maxDecimals, 't3BuyP', 't3SellP', 't3Margin', 't3BuyR', 't3SellR', 't3Err');

        const nowTime = new Date().toLocaleTimeString('vi-VN', { hour12: false });
        if (document.getElementById('marketRecTime')) {
            document.getElementById('marketRecTime').innerHTML = `<i class="fas fa-clock"></i> Cập nhật giá: ${nowTime}`;
        }
        syncText('marketRecTime', nowTime);

        if (typeof window.triggerAutoUpdateAds === 'function') {
            window.triggerAutoUpdateAds();
        }
    }

    function applyFiltersAndRender() {
        window.filteredBuyAds = filterAdsList(window.allBuyAdsData);
        window.filteredSellAds = filterAdsList(window.allSellAdsData);
        calculateRecommendations();
        if (!isAdsTab) renderPage();
    }

    function renderPage() {
        if (isAdsTab) return;
        
        const showAll = document.getElementById('toggleShowAllAds') && document.getElementById('toggleShowAllAds').checked;
        
        let currentDataList = [];
        if (currentSide === "1") {
            currentDataList = showAll ? window.allSellAdsData : window.filteredSellAds;
        } else {
            currentDataList = showAll ? window.allBuyAdsData : window.filteredBuyAds;
        }
        
        // NẾU ĐANG BẬT LỌC MỐC THÌ CHỈ HIỂN THỊ ĐỐI THỦ CỦA MỐC ĐÓ
        if (activeTierFilter > 0) {
            const minEl = document.getElementById(`tier${activeTierFilter}Min`);
            const maxEl = document.getElementById(`tier${activeTierFilter}Max`);
            
            const tMin = parseFloat(minEl.value || minEl.placeholder || 0);
            const tMax = parseFloat(maxEl.value || maxEl.placeholder || Infinity);
            
            currentDataList = currentDataList.filter(ad => {
                const p = parseFloat(ad.price); 
                const minU = parseFloat(ad.minAmount) / p;
                const maxU = parseFloat(ad.maxAmount) / p;
                return (maxU >= tMin && minU <= tMax); 
            });
        }
        
        const p2pTableBody = document.getElementById('p2pTableBody');
        p2pTableBody.innerHTML = '';
        const totalItems = currentDataList.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        
        if (totalItems === 0) {
            p2pTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Không có quảng cáo nào để hiển thị.</td></tr>';
            document.getElementById('paginationControls').innerHTML = '';
            return;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        const pageData = currentDataList.slice(startIndex, endIndex);

        let validRankCounter = startIndex + 1;

        pageData.forEach((ad, idx) => {
            const price = parseFloat(ad.price).toLocaleString();
            const lastQty = parseFloat(ad.lastQuantity).toLocaleString();
            const minKZT = parseFloat(ad.minAmount).toLocaleString();
            const maxKZT = parseFloat(ad.maxAmount).toLocaleString();
            const minUSDT = (parseFloat(ad.minAmount) / parseFloat(ad.price)).toLocaleString(undefined, {maximumFractionDigits: 0});
            const maxUSDT = (parseFloat(ad.maxAmount) / parseFloat(ad.price)).toLocaleString(undefined, {maximumFractionDigits: 0});

            let paymentHtml = '';
            if (ad.payments && Array.isArray(ad.payments)) {
                ad.payments.forEach(payId => {
                    const payName = typeof PAYMENT_METHODS !== 'undefined' && PAYMENT_METHODS[payId] ? PAYMENT_METHODS[payId] : `Bank Transfer (${payId})`;
                    paymentHtml += `<span class="payment-badge">${payName}</span>`;
                });
            }

            let rowStyle = "";
            let nameClass = "text-dark";
            let rankBadge = "";
            let reasonBadge = "";

            if (ad._passedFilter === false) {
                rowStyle = "opacity: 0.55; background-color: #f8f9fa;";
                nameClass = "text-muted text-decoration-line-through";
                rankBadge = `<span class="badge bg-light text-secondary border">Bỏ qua</span>`;
                reasonBadge = `<div class="text-danger mt-1 fw-bold" style="font-size: 11.5px;"><i class="fas fa-ban"></i> Loại: ${ad._filterReason}</div>`;
            } else {
                rankBadge = `<span class="badge bg-secondary">Top ${validRankCounter}</span>`;
                validRankCounter++; 
            }

            const tr = document.createElement('tr');
            tr.style.cssText = rowStyle;
            tr.innerHTML = `
                <td style="padding-left: 20px;">
                    <div class="fw-bold d-flex align-items-center gap-2">
                        ${rankBadge} <span class="${nameClass}">${ad.nickName}</span>
                    </div>
                    <div style="font-size: 12px; color: #848e9c; margin-top: 4px;">
                        ${ad.recentOrderNum || 0} lệnh | Tỉ lệ: ${ad.recentExecuteRate || 0}%
                    </div>
                    ${reasonBadge}
                </td>
                <td>
                    <div class="price-text" style="color: ${currentSide === "1" ? '#0ecb81' : '#f6465d'}">${price}</div>
                </td>
                <td>
                    <div class="limit-text">${lastQty} USDT</div>
                    <div class="limit-subtext">${minKZT} - ${maxKZT} KZT</div>
                    <div class="limit-subtext">≈ ${minUSDT} - ${maxUSDT} USDT</div>
                </td>
                <td style="max-width: 250px;">${paymentHtml}</td>
            `;
            p2pTableBody.appendChild(tr);
        });

        let pagHtml = `<li class="${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage - 1}"><i class="fas fa-chevron-left" style="font-size: 11px;"></i></a></li>`;
        let pages = [];
        if (totalPages <= 7) { 
            for (let i = 1; i <= totalPages; i++) pages.push(i); 
        } else {
            if (currentPage <= 4) {
                pages = [1, 2, 3, 4, 5, '...', totalPages];
            } else if (currentPage >= totalPages - 3) {
                pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            } else {
                pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
            }
        }

        pages.forEach(p => {
            if (p === '...') pagHtml += `<li><span class="ellipsis">...</span></li>`;
            else pagHtml += `<li class="${currentPage === p ? 'active' : ''}"><a class="page-link" href="#" data-page="${p}">${p}</a></li>`;
        });
        
        pagHtml += `<li class="${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage + 1}"><i class="fas fa-chevron-right" style="font-size: 11px;"></i></a></li>`;
        
        const pagContainer = document.getElementById('paginationControls');
        pagContainer.innerHTML = pagHtml;
        
        pagContainer.querySelectorAll('.page-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPage = parseInt(e.currentTarget.dataset.page);
                if (targetPage >= 1 && targetPage <= totalPages && targetPage !== currentPage) {
                    currentPage = targetPage; 
                    renderPage();
                }
            });
        });
    }
});