document.addEventListener('DOMContentLoaded', () => {
    if(typeof isAdsTab === 'undefined' || !isAdsTab) return;
    // === FIX: Bê terminal ra ngoài myAdsList ===
    (function relocateTerminal() {
        const terminalDiv = document.getElementById('terminalLog');
        if (!terminalDiv) return;
        const terminalBox = terminalDiv.closest('.bg-dark') || terminalDiv.parentElement;
        if (!terminalBox) return;
        const myAdsList = document.getElementById('myAdsList');
        const panelBody = myAdsList ? myAdsList.parentElement : null;
        if (!panelBody) return;
        if (myAdsList.contains(terminalBox)) {
            panelBody.appendChild(terminalBox);
            console.log("[FIX] Đã chuyển terminalLog ra ngoài myAdsList");
        }
    })();

    // === Quản lý số dư USDT Funding ===
    window.adFundAvailValue = 0;

    function injectFundUI() {
        const adQtyInp = document.getElementById('adQuantity');
        if (!adQtyInp) return false;
        if (document.getElementById('btnMaxAdQuantity')) return true;

        const colDiv = adQtyInp.closest('.col-md-4') || adQtyInp.parentElement;
        const labelEl = colDiv ? colDiv.querySelector('label') : null;
        if (labelEl) {
            labelEl.classList.add('d-flex', 'justify-content-between', 'align-items-center');
            if (!labelEl.querySelector('.qty-label-text')) {
                const oldText = labelEl.innerText.trim();
                labelEl.innerHTML = `<span class="qty-label-text">${oldText}</span>`;
            }
            const availSpan = document.createElement('small');
            availSpan.className = 'text-muted ms-2';
            availSpan.innerHTML = `Khả dụng: <strong class="text-success" id="adFundAvail">--</strong> USDT 
                <button type="button" class="btn btn-sm btn-outline-success py-0 px-2 ms-1" id="btnLoadFundBalance" style="font-size: 12px;">
                    <i class="fas fa-sync-alt"></i>
                </button>`;
            labelEl.appendChild(availSpan);
        }

        const parent = adQtyInp.parentElement;
        const inputGroup = document.createElement('div');
        inputGroup.className = 'input-group';
        parent.insertBefore(inputGroup, adQtyInp);
        inputGroup.appendChild(adQtyInp);

        const btnMax = document.createElement('button');
        btnMax.type = 'button';
        btnMax.id = 'btnMaxAdQuantity';
        btnMax.className = 'btn btn-outline-primary fw-bold';
        btnMax.innerText = 'MAX';
        inputGroup.appendChild(btnMax);

        const errSmall = document.createElement('small');
        errSmall.id = 'adQuantityErr';
        errSmall.className = 'text-danger d-none';
        errSmall.innerText = 'Vượt quá số dư khả dụng!';
        parent.appendChild(errSmall);

        btnMax.addEventListener('click', () => {
            const sideEl = document.getElementById('adSide');
            const side = sideEl ? sideEl.value : "1";
            if (side === "0") {
                const maxBuy = window.computeMaxBuyUsdt();
                if (maxBuy <= 0) return showToast("Chưa lấy được số dư KZT Freedom hoặc giá đang trống!", "warning");
                adQtyInp.value = maxBuy.toFixed(2);
                window.addTerminalLog(`[MAX MUA] = ${maxBuy.toFixed(2)} USDT (KZT Freedom / giá)`, 'success');
            } else {
                if (!window.adFundAvailValue || window.adFundAvailValue <= 0) return showToast("Chưa có số dư Funding!", "warning");
                const maxVal = (Math.floor(window.adFundAvailValue * 100) / 100).toFixed(2);
                adQtyInp.value = maxVal;
                window.addTerminalLog(`[MAX BÁN] = ${maxVal} USDT (Funding)`, 'success');
            }
            validateAdQuantity();
        });

        document.getElementById('btnLoadFundBalance').addEventListener('click', () => window.loadAdFundBalance());
        adQtyInp.addEventListener('input', validateAdQuantity);
        return true;
    }

    function validateAdQuantity() {
        const inp = document.getElementById('adQuantity');
        const err = document.getElementById('adQuantityErr');
        const availLabel = document.getElementById('adFundAvail');
        const maxBtn = document.getElementById('btnMaxAdQuantity');
        if (!inp) return true;
        const sideEl = document.getElementById('adSide');
        const side = sideEl ? sideEl.value : "1";

        if (side === "0") {
            inp.classList.remove('is-invalid');
            if (err) err.classList.add('d-none');
            if (availLabel && availLabel.parentElement) availLabel.parentElement.style.display = 'none';
            if (maxBtn) maxBtn.style.display = '';
            return true;
        }
        if (availLabel && availLabel.parentElement) availLabel.parentElement.style.display = '';
        if (maxBtn) maxBtn.style.display = '';

        const val = parseFloat(inp.value || 0);
        const maxAvail = parseFloat(window.adFundAvailValue || 0);
        if (maxAvail > 0 && val > maxAvail) {
            inp.classList.add('is-invalid');
            if (err) err.classList.remove('d-none');
            return false;
        } else {
            inp.classList.remove('is-invalid');
            if (err) err.classList.add('d-none');
            return true;
        }
    }

    window.loadAdFundBalance = async function() {
        const elAvail = document.getElementById('adFundAvail');
        const btn = document.getElementById('btnLoadFundBalance');
        if (elAvail) elAvail.innerText = '...';
        if (btn) btn.disabled = true;
        try {
            const proxyConfig = {
                ip:   document.getElementById('proxyIp')   ? document.getElementById('proxyIp').value.trim()   : "",
                port: document.getElementById('proxyPort') ? document.getElementById('proxyPort').value.trim() : "",
                user: document.getElementById('proxyUser') ? document.getElementById('proxyUser').value.trim() : "",
                pass: document.getElementById('proxyPass') ? document.getElementById('proxyPass').value.trim() : ""
            };
            const res = await fetch('/api/usdt_balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group: currentGroup, account_index: selectedAccountIndex, proxy: proxyConfig })
            });
            const data = await res.json();
            let avail = 0;
            if (data.status === 'success' && data.data && data.data.FUND) {
                const fund = data.data.FUND;
                if (fund.retCode === 0 && fund.result && Array.isArray(fund.result.balance)) {
                    const usdt = fund.result.balance.find(b => b.coin === "USDT");
                    if (usdt) avail = parseFloat(usdt.transferBalance || 0);
                }
            }
            window.adFundAvailValue = isNaN(avail) ? 0 : avail;
            if (elAvail) elAvail.innerText = window.adFundAvailValue.toFixed(2);
            const inp = document.getElementById('adQuantity');
            if (inp) inp.setAttribute('max', window.adFundAvailValue.toFixed(2));
            validateAdQuantity();
        } catch(e) {
            if (elAvail) elAvail.innerText = 'ERR';
            window.addTerminalLog(`[Số dư Funding] Lỗi: ${e.message || e}`, 'danger');
        } finally {
            if (btn) btn.disabled = false;
        }
    };
    injectFundUI();
    window.injectFundUI = injectFundUI;

    // === Tier Picker ===
    function injectTierPickerForPostForm() {
        if (document.getElementById('postAdTierPicker')) return;
        const postForm = document.getElementById('postAdForm');
        if (!postForm) return;
        const panel = document.createElement('div');
        panel.id = 'postAdTierPicker';
        panel.className = 'alert alert-info mb-3 d-flex align-items-center flex-wrap gap-2';
        panel.innerHTML = `
            <i class="fas fa-magic text-primary"></i>
            <strong>Áp dụng nhanh theo Mốc:</strong>
            <button type="button" class="btn btn-sm tier-pick-btn" data-tier="1">Mốc 1</button>
            <button type="button" class="btn btn-sm tier-pick-btn" data-tier="2">Mốc 2</button>
            <button type="button" class="btn btn-sm tier-pick-btn" data-tier="3">Mốc 3</button>
            <small class="text-muted ms-2">→ Tự điền Giá + Min/Max dựa trên Side hiện tại (Mua/Bán)</small>
        `;
        const firstRow = postForm.querySelector('.row');
        if (firstRow) firstRow.parentElement.insertBefore(panel, firstRow);
        else postForm.prepend(panel);
        panel.querySelectorAll('.tier-pick-btn').forEach(btn => {
            btn.addEventListener('click', () => applyTierToPostForm(btn.dataset.tier));
        });
    }

    function applyTierToPostForm(tier) {
        const sideEl = document.getElementById('adSide');
        const side = sideEl ? sideEl.value : "0";
        const priceElId = side === "0" ? `t${tier}BuyP` : `t${tier}SellP`;
        const priceDOM = document.getElementById(priceElId) || document.querySelector(`.sync-${priceElId}`);
        if (!priceDOM || !priceDOM.innerText || priceDOM.innerText === "..." || priceDOM.innerText === "NaN") {
            return showToast(`Chưa có giá tham chiếu cho Mốc ${tier}!`, "warning");
        }
        const priceFloat = parseFloat(priceDOM.innerText.replace(/,/g, '').trim());
        if (isNaN(priceFloat) || priceFloat <= 0) return showToast(`Giá Mốc ${tier} không hợp lệ!`, "warning");

        const getNum = (id) => {
            const el = document.getElementById(id);
            if (!el) return 0;
            const v = parseFloat(el.value || el.placeholder || 0);
            return isNaN(v) ? 0 : v;
        };
        const tierMinUsdt = getNum(`tier${tier}Min`);
        const tierMaxUsdt = getNum(`tier${tier}Max`);
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
        };
        setVal('adPrice', priceFloat.toString());
        if (tierMinUsdt > 0) setVal('adMinAmount', (tierMinUsdt * priceFloat).toFixed(2));
        if (tierMaxUsdt > 0) setVal('adMaxAmount', (tierMaxUsdt * priceFloat).toFixed(2));

        ['adPrice', 'adMinAmount', 'adMaxAmount'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('border-success');
                setTimeout(() => el.classList.remove('border-success'), 1500);
            }
        });

        if (side === "0") {
            const kzt = window.getFreedomKztBalance();
            if (kzt > 0 && priceFloat > 0) {
                const maxUsdt = Math.floor((kzt / priceFloat) * 100) / 100;
                const qtyEl = document.getElementById('adQuantity');
                if (qtyEl) {
                    qtyEl.value = maxUsdt.toFixed(2);
                    qtyEl.dispatchEvent(new Event('input', { bubbles: true }));
                    qtyEl.classList.add('border-success');
                    setTimeout(() => qtyEl.classList.remove('border-success'), 1500);
                }
                window.addTerminalLog(`[Mốc ${tier}] Quantity MUA = ${maxUsdt.toFixed(2)} USDT (KZT ${kzt} / giá ${priceFloat})`, 'info');
            }
        }
        window.addTerminalLog(`[Áp Mốc ${tier}] Side=${side === "0" ? "MUA" : "BÁN"} | Giá=${priceFloat}`, 'info');
        showToast(`Đã áp dụng Mốc ${tier}!`, "success");
    }
    injectTierPickerForPostForm();

    // === Remark Picker ===
    window.getSavedRemarks = function() {
        try { return JSON.parse(localStorage.getItem('savedAdRemarks') || '[]'); } catch(e) { return []; }
    };
    window.setSavedRemarks = function(arr) {
        localStorage.setItem('savedAdRemarks', JSON.stringify(arr));
    };

    function injectRemarkPicker() {
        if (document.getElementById('remarkPickerBox')) return;
        const remarkEl = document.getElementById('adRemark');
        if (!remarkEl) return;
        const wrap = remarkEl.parentElement;
        const labelEl = wrap.querySelector('label');
        if (labelEl) {
            labelEl.classList.add('d-flex', 'justify-content-between', 'align-items-center');
            const ctrlBox = document.createElement('div');
            ctrlBox.id = 'remarkPickerBox';
            ctrlBox.className = 'd-flex align-items-center gap-1';
            ctrlBox.innerHTML = `
                <select class="form-select form-select-sm" id="remarkPickerSelect">
                    <option value="">-- Chọn ghi chú đã lưu --</option>
                </select>
                <button type="button" class="btn btn-sm btn-outline-success" id="btnSaveRemark" title="Lưu">
                    <i class="fas fa-save"></i> Lưu
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" id="btnDeleteRemark" title="Xóa">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            labelEl.appendChild(ctrlBox);
        }
        renderRemarkSelect();
        document.getElementById('remarkPickerSelect').addEventListener('change', (e) => {
            const idx = e.target.value;
            if (idx === "") return;
            const list = window.getSavedRemarks();
            if (list[idx]) {
                remarkEl.value = list[idx].content;
                remarkEl.classList.add('border-success');
                setTimeout(() => remarkEl.classList.remove('border-success'), 1500);
            }
        });
        document.getElementById('btnSaveRemark').addEventListener('click', () => {
            const content = remarkEl.value.trim();
            if (!content) return showToast("Ghi chú đang trống!", "warning");
            const title = prompt("Đặt tên cho ghi chú này:", content.slice(0, 30));
            if (!title) return;
            const list = window.getSavedRemarks();
            const existIdx = list.findIndex(x => x.title === title);
            if (existIdx >= 0) list[existIdx].content = content;
            else list.push({ title: title, content: content });
            window.setSavedRemarks(list);
            renderRemarkSelect();
            showToast(`Đã lưu "${title}"`, "success");
        });
        document.getElementById('btnDeleteRemark').addEventListener('click', () => {
            const sel = document.getElementById('remarkPickerSelect');
            const idx = sel.value;
            if (idx === "") return showToast("Chọn ghi chú cần xóa trước!", "warning");
            const list = window.getSavedRemarks();
            if (!list[idx]) return;
            if (!confirm(`Xóa ghi chú "${list[idx].title}"?`)) return;
            list.splice(idx, 1);
            window.setSavedRemarks(list);
            renderRemarkSelect();
        });
    }

    function renderRemarkSelect() {
        const sel = document.getElementById('remarkPickerSelect');
        if (!sel) return;
        const list = window.getSavedRemarks();
        sel.innerHTML = '<option value="">-- Chọn ghi chú đã lưu --</option>';
        list.forEach((item, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.innerText = (item.isDefault ? '⭐ ' : '') + item.title;
            opt.title = item.content;
            if (item.isDefault) opt.selected = true;
            sel.appendChild(opt);
        });
    }
    injectRemarkPicker();

    // === MẶC ĐỊNH KHI MỞ FORM ===
    window.postFormDefaultsApplied = false;

    function setFormVal(id, val) {
        const el = document.getElementById(id);
        if (el) {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    const adSideElForDefault = document.getElementById('adSide');
    if (adSideElForDefault) {
        adSideElForDefault.addEventListener('change', () => {
            window.applyDefaultQuantityBySide();
            validateAdQuantity();
        });
    }

    window.getDefaultRemarkIndex = function() {
        const list = window.getSavedRemarks();
        const idx = list.findIndex(x => x.isDefault === true);
        return idx >= 0 ? idx : -1;
    };
    window.applyDefaultRemark = function() {
        const idx = window.getDefaultRemarkIndex();
        if (idx < 0) return false;
        const list = window.getSavedRemarks();
        const remarkEl = document.getElementById('adRemark');
        if (remarkEl && list[idx]) { remarkEl.value = list[idx].content; return true; }
        return false;
    };

    function upgradeRemarkPickerWithDefault() {
        const box = document.getElementById('remarkPickerBox');
        if (!box || document.getElementById('btnSetDefaultRemark')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btnSetDefaultRemark';
        btn.className = 'btn btn-sm btn-outline-warning';
        btn.title = 'Đặt mặc định';
        btn.innerHTML = '<i class="fas fa-star"></i>';
        const btnDel = document.getElementById('btnDeleteRemark');
        if (btnDel) box.insertBefore(btn, btnDel);
        else box.appendChild(btn);
        btn.addEventListener('click', () => {
            const sel = document.getElementById('remarkPickerSelect');
            const idx = sel.value;
            if (idx === "") return showToast("Chọn 1 ghi chú trước!", "warning");
            const list = window.getSavedRemarks();
            list.forEach(x => x.isDefault = false);
            list[idx].isDefault = true;
            window.setSavedRemarks(list);
            renderRemarkSelect();
            showToast(`Đã đặt "${list[idx].title}" làm mặc định!`, "success");
        });
    }
    upgradeRemarkPickerWithDefault();

    window.applyDefaultCustomerCondition = function() {
        const regEl = document.getElementById('adRegisterTime');
        if (regEl && (regEl.value === "" || regEl.value === "0")) {
            regEl.value = "15";
            regEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    window.applyAllPostFormDefaults = function() {
        if (window.postFormDefaultsApplied) return;
        window.postFormDefaultsApplied = true;
        window.applyDefaultQuantityBySide();
        setTimeout(() => {
            if (typeof window.applyTierToPostForm === 'function') {
                window.applyTierToPostForm("2");
            }
        }, 800);
        window.applyDefaultRemark();
        window.applyDefaultCustomerCondition();
    };

    setTimeout(() => {
        const postFormVisible = document.getElementById('postAdForm') 
            && !document.getElementById('postAdForm').classList.contains('d-none');
        if (postFormVisible) window.applyAllPostFormDefaults();
    }, 1000);

    // === Freedom KZT balance ===
    window.getFreedomKztBalance = function() {
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

    window.computeMaxBuyUsdt = function() {
        const kzt = window.getFreedomKztBalance();
        const priceEl = document.getElementById('adPrice');
        const price = priceEl ? parseFloat(priceEl.value || 0) : 0;
        if (kzt <= 0 || price <= 0) return 0;
        return Math.floor((kzt / price) * 100) / 100;
    };

    window.applyDefaultQuantityBySide = function() {
        const sideEl = document.getElementById('adSide');
        if (!sideEl) return;
        const side = sideEl.value;
        if (side === "0") {
            const tryFill = () => {
                const maxUsdt = window.computeMaxBuyUsdt();
                if (maxUsdt > 0) {
                    setFormVal('adQuantity', maxUsdt.toFixed(2));
                } else {
                    setFormVal('adQuantity', "2000");
                }
            };
            setTimeout(tryFill, 900);
        } else {
            if (window.adFundAvailValue && window.adFundAvailValue > 0) {
                const maxVal = (Math.floor(window.adFundAvailValue * 100) / 100).toFixed(2);
                setFormVal('adQuantity', maxVal);
            } else {
                setTimeout(() => {
                    if (window.adFundAvailValue && window.adFundAvailValue > 0) {
                        const maxVal = (Math.floor(window.adFundAvailValue * 100) / 100).toFixed(2);
                        setFormVal('adQuantity', maxVal);
                    }
                }, 1500);
            }
        }
    };
    // === SIDE TOGGLE 2 NÚT MUA/BÁN ===
    function injectSideToggle() {
        const sideSelect = document.getElementById('adSide');
        if (!sideSelect || document.getElementById('sideToggleBox')) return;
        const box = document.createElement('div');
        box.id = 'sideToggleBox';
        box.className = 'btn-group w-100';
        box.setAttribute('role', 'group');
        box.innerHTML = `
            <button type="button" class="btn side-btn side-buy" data-side="0">
                <i class="fas fa-arrow-down"></i> MUA (Buy)
            </button>
            <button type="button" class="btn side-btn side-sell" data-side="1">
                <i class="fas fa-arrow-up"></i> BÁN (Sell)
            </button>
        `;
        sideSelect.style.display = 'none';
        sideSelect.parentNode.insertBefore(box, sideSelect);
        const updateBtns = () => {
            const v = sideSelect.value;
            box.querySelectorAll('.side-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.side === v);
            });
        };
        box.querySelectorAll('.side-btn').forEach(b => {
            b.addEventListener('click', () => {
                sideSelect.value = b.dataset.side;
                sideSelect.dispatchEvent(new Event('change', { bubbles: true }));
                updateBtns();
            });
        });
        updateBtns();
    }
    injectSideToggle();

    // === LAYOUT FIX: Remark narrower ===
    (function fixLayout() {
        const postForm = document.getElementById('postAdForm');
        if (!postForm) return;
        const remark = document.getElementById('adRemark');
        if (remark) {
            remark.setAttribute('rows', '5');
            const col = remark.closest('.col-md-12') || remark.parentElement;
            if (col && col.classList.contains('col-md-12')) {
                col.classList.remove('col-md-12');
                col.classList.add('col-md-8');
            }
        }
    })();

    // === STYLES (FULL WIDTH + FONT LỚN) ===
    (function injectStyles() {
        const old = document.getElementById('postAdFormStylesAll');
        if (old) old.remove();
        const style = document.createElement('style');
        style.id = 'postAdFormStylesAll';
        style.innerHTML = `
            /* FORM CONTAINER full width */
            #postAdForm {
                padding: 16px 8px 8px;
                background: #fff;
                border-radius: 12px;
                width: 100%;
                max-width: 100%;
            }
            #postAdForm .row { width: 100%; margin: 0; }

            /* INPUTS - lớn rõ */
            #postAdForm .form-control,
            #postAdForm .form-select,
            #postAdForm textarea {
                padding: 10px 14px !important;
                font-size: 15px !important;
                border-radius: 8px !important;
                border: 1.5px solid #e2e8f0 !important;
                height: auto !important;
                min-height: 44px !important;
                font-weight: 500;
                transition: border-color .15s, box-shadow .15s;
            }
            #postAdForm .form-control:focus,
            #postAdForm .form-select:focus,
            #postAdForm textarea:focus {
                border-color: #3b82f6 !important;
                box-shadow: 0 0 0 4px rgba(59,130,246,.15) !important;
                outline: none !important;
            }
            #postAdForm .form-control.border-success {
                border-color: #22c55e !important;
                background: #f0fdf4 !important;
                box-shadow: 0 0 0 4px rgba(34,197,94,.20) !important;
            }
            #postAdForm .form-control.is-invalid {
                border-color: #ef4444 !important;
                background: #fef2f2 !important;
            }
            #postAdForm .form-control:disabled,
            #postAdForm .form-control[readonly] {
                background: #f1f5f9 !important;
                color: #64748b !important;
                font-weight: 600;
            }
            #postAdForm textarea#adRemark {
                min-height: 130px !important;
                resize: vertical;
                font-size: 14px !important;
            }

            /* LABELS lớn rõ */
            #postAdForm label.ad-form-label {
                font-size: 13px !important;
                margin-bottom: 6px !important;
                color: #475569 !important;
                font-weight: 700 !important;
                text-transform: uppercase;
                letter-spacing: .4px;
            }

            /* SIDE TOGGLE 2 NÚT */
            #sideToggleBox {
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 1px 4px rgba(0,0,0,.06);
            }
            #sideToggleBox .side-btn {
                font-weight: 700 !important;
                font-size: 14.5px !important;
                padding: 11px 0 !important;
                border: 1.5px solid #e2e8f0 !important;
                background: #fff !important;
                color: #94a3b8 !important;
                transition: all .15s;
                letter-spacing: .3px;
            }
            #sideToggleBox .side-btn:hover { background: #f8fafc !important; }
            #sideToggleBox .side-btn.active.side-buy {
                background: linear-gradient(135deg, #10b981, #059669) !important;
                color: #fff !important;
                border-color: #047857 !important;
                box-shadow: inset 0 -2px 0 rgba(0,0,0,.15);
            }
            #sideToggleBox .side-btn.active.side-sell {
                background: linear-gradient(135deg, #ef4444, #dc2626) !important;
                color: #fff !important;
                border-color: #b91c1c !important;
                box-shadow: inset 0 -2px 0 rgba(0,0,0,.15);
            }
            #sideToggleBox .side-btn:not(.active).side-buy:hover {
                color: #059669 !important;
                border-color: #6ee7b7 !important;
            }
            #sideToggleBox .side-btn:not(.active).side-sell:hover {
                color: #dc2626 !important;
                border-color: #fca5a5 !important;
            }

            /* INPUT GROUP (MAX) */
            #postAdForm .input-group .form-control {
                border-radius: 8px 0 0 8px !important;
            }
            #postAdForm .input-group .btn {
                border-radius: 0 8px 8px 0 !important;
                font-weight: 700 !important;
                padding: 4px 18px !important;
                letter-spacing: .5px;
            }
            #btnMaxAdQuantity {
                background: linear-gradient(135deg, #dbeafe, #bfdbfe) !important;
                color: #1d4ed8 !important;
                border: 1.5px solid #93c5fd !important;
                border-left: 0 !important;
                font-size: 13px !important;
            }
            #btnMaxAdQuantity:hover {
                background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
                color: #fff !important;
            }

            /* TIER PICKER */
            #postAdTierPicker {
                background: linear-gradient(135deg, #f0f9ff 0%, #ecfeff 50%, #f0fdfa 100%) !important;
                border: 1.5px solid #bae6fd !important;
                border-radius: 12px !important;
                padding: 10px 18px !important;
                font-size: 14px !important;
                box-shadow: 0 2px 8px rgba(14,165,233,.08);
            }
            #postAdTierPicker strong { color: #0c4a6e; }
            #postAdTierPicker .tier-pick-btn {
                border-radius: 999px !important;
                padding: 7px 22px !important;
                font-weight: 700 !important;
                font-size: 13.5px !important;
                background: #fff !important;
                color: #0369a1 !important;
                border: 1.5px solid #bae6fd !important;
                transition: all .2s !important;
                position: relative;
            }
            #postAdTierPicker .tier-pick-btn:hover {
                background: #0ea5e9 !important;
                color: #fff !important;
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(14,165,233,.35);
            }
            #postAdTierPicker .tier-pick-btn.tier-active {
                background: linear-gradient(135deg, #0ea5e9, #2563eb) !important;
                color: #fff !important;
                border-color: #1d4ed8 !important;
                box-shadow: 0 4px 14px rgba(37,99,235,.45) !important;
                transform: scale(1.05);
            }
            #postAdTierPicker .tier-pick-btn.tier-active::after {
                content: " ✓";
                font-weight: 900;
            }
            #postAdTierPicker small { font-size: 12.5px !important; }

            /* PTTT LIST */
            #paymentListContainer {
                max-height: 260px !important;
                overflow-y: auto !important;
                background: #f8fafc !important;
                border: 1.5px solid #e2e8f0 !important;
                border-radius: 10px !important;
                padding: 6px !important;
            }
            #paymentListContainer .form-check {
                padding: 9px 10px 9px 38px !important;
                margin-bottom: 4px !important;
                border-radius: 8px !important;
                border-bottom: 0 !important;
                background: #fff;
                transition: all .15s;
                border: 1.5px solid transparent;
                font-size: 14px !important;
            }
            #paymentListContainer .form-check:hover {
                background: #eff6ff;
                border-color: #bfdbfe;
            }
            #paymentListContainer .form-check label { font-size: 14px !important; }
            #paymentListContainer .form-check-input {
                width: 18px; height: 18px;
                margin-left: -28px;
                cursor: pointer;
            }
            #paymentListContainer .form-check-input:checked {
                background-color: #2563eb;
                border-color: #2563eb;
            }
            #paymentListContainer .form-check-input:checked ~ label {
                font-weight: 600;
                color: #1d4ed8;
            }
            #paymentListContainer .badge {
                font-size: 11.5px !important;
                padding: 4px 8px !important;
            }
            #paymentListContainer .form-check[style*="fff7d6"] {
                background: linear-gradient(135deg, #fef3c7, #fde68a) !important;
                border-left: 4px solid #f59e0b !important;
                box-shadow: 0 2px 8px rgba(245,158,11,.20);
            }

            /* ADS PAYMENT IDS */
            #adPaymentIds {
                background: linear-gradient(135deg, #fef3c7, #fde68a) !important;
                color: #78350f !important;
                font-weight: 700 !important;
                border-color: #fcd34d !important;
                font-size: 13.5px !important;
                padding: 8px 12px !important;
            }

            /* REMARK PICKER UI */
            #remarkPickerBox {
                background: #f8fafc;
                padding: 4px 8px;
                border-radius: 8px;
                border: 1px solid #e2e8f0;
            }
            #remarkPickerBox .form-select {
                width: 230px !important;
                font-size: 12.5px !important;
                padding: 5px 10px !important;
                min-height: 32px !important;
                border-radius: 6px !important;
            }
            #remarkPickerBox .btn {
                padding: 3px 10px !important;
                font-size: 12px !important;
            }

            /* KHẢ DỤNG / FUND */
            #adFundAvail {
                font-weight: 800;
                color: #16a34a;
                font-size: 14px !important;
            }
            #btnLoadFundBalance {
                border-radius: 999px !important;
                padding: 1px 8px !important;
            }

            /* ĐKKH */
            #postAdForm h6.text-primary {
                color: #0284c7 !important;
                padding: 12px 0 8px !important;
                border-top: 2px dashed #e2e8f0;
                margin-top: 12px !important;
                font-size: 15px !important;
                letter-spacing: .3px;
            }
            #postAdForm h6.text-primary + .row .form-label {
                font-size: 12.5px !important;
                margin-bottom: 4px !important;
                text-transform: none !important;
                letter-spacing: 0 !important;
            }
            #postAdForm h6.text-primary + .row .form-select-sm {
                font-size: 13.5px !important;
                padding: 7px 12px !important;
                min-height: 38px !important;
            }
            #postAdForm .form-check-input { cursor: pointer; }
            #postAdForm .form-check-input:checked {
                background-color: #2563eb;
                border-color: #2563eb;
            }

            /* ERROR */
            #adQuantityErr {
                margin-top: 5px !important;
                font-weight: 600 !important;
                font-size: 12px !important;
                color: #dc2626 !important;
            }

            /* SUBMIT */
            #btnSubmitAd {
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%) !important;
                border: 0 !important;
                padding: 12px 38px !important;
                border-radius: 12px !important;
                font-size: 14.5px !important;
                font-weight: 700 !important;
                letter-spacing: 1px;
                box-shadow: 0 6px 20px rgba(59,130,246,.35) !important;
                transition: all .2s !important;
                text-transform: uppercase;
            }
            #btnSubmitAd:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 10px 28px rgba(59,130,246,.50) !important;
            }
            #btnSubmitAd:active { transform: translateY(0); }
            #btnSubmitAd:disabled {
                background: #cbd5e1 !important;
                box-shadow: none !important;
            }

            /* TẢI PTTT */
            #btnLoadPayments {
                border-radius: 999px !important;
                font-weight: 600 !important;
            }

            /* SCROLLBAR */
            #postAdForm ::-webkit-scrollbar { width: 6px; }
            #postAdForm ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
            #postAdForm ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

            /* ANIMATION */
            #postAdForm .col-md-3, 
            #postAdForm .col-md-4, 
            #postAdForm .col-md-8, 
            #postAdForm .col-md-12 {
                animation: fadeUp .3s ease both;
            }
            @keyframes fadeUp {
                from { opacity: 0; transform: translateY(8px); }
                to   { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    })();

    // === HIGHLIGHT MỐC ĐANG ÁP DỤNG ===
    window.activeTier = null;
    window.setActiveTierUI = function(tier) {
        window.activeTier = tier ? tier.toString() : null;
        document.querySelectorAll('#postAdTierPicker .tier-pick-btn').forEach(btn => {
            btn.classList.toggle('tier-active', btn.dataset.tier === window.activeTier);
        });
    };
    if (typeof applyTierToPostForm === 'function' && !window._applyTierWrapped) {
        const _origApplyTier = applyTierToPostForm;
        window.applyTierToPostForm = function(tier) {
            const result = _origApplyTier(tier);
            window.setActiveTierUI(tier);
            return result;
        };
        document.querySelectorAll('#postAdTierPicker .tier-pick-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => window.applyTierToPostForm(newBtn.dataset.tier));
        });
        window._applyTierWrapped = true;
    }
    setTimeout(() => { if (!window.activeTier) window.setActiveTierUI("2"); }, 1200);

    // === Auto load PTTT + tick Freedom ===
    window.autoSelectPaymentByName = function(keyword = "freedom") {
        const checkboxes = document.querySelectorAll('.pay-checkbox');
        if (!checkboxes.length) return false;
        const container = document.getElementById('paymentListContainer');
        let selected = [];
        let matchRows = [];
        checkboxes.forEach(cb => {
            const row = cb.closest('.form-check');
            const label = row ? row.querySelector('label') : null;
            const labelText = label ? label.innerText.toLowerCase() : "";
            if (labelText.includes(keyword.toLowerCase())) {
                cb.checked = true;
                selected.push(cb.value);
                if (row) matchRows.push(row);
            }
        });
        if (container && matchRows.length) {
            matchRows.reverse().forEach(row => {
                row.style.backgroundColor = '#fff7d6';
                row.style.borderLeft = '3px solid #ffc107';
                container.prepend(row);
            });
        }
        if (selected.length > 0) {
            const payIdsEl = document.getElementById('adPaymentIds');
            if (payIdsEl) {
                const cur = (payIdsEl.value || "").split(',').map(s => s.trim()).filter(x => x);
                const merged = [...new Set([...cur, ...selected])].slice(0, 5);
                payIdsEl.value = merged.join(',');
            }
            window.addTerminalLog(`[Auto PTTT] Đã chọn ${selected.length} PTTT chứa "${keyword}"`, 'success');
            return true;
        }
        return false;
    };

    window.autoLoadPaymentsAndPickFreedom = async function() {
        const container = document.getElementById('paymentListContainer');
        const needLoad = !container || !container.querySelector('.pay-checkbox');
        if (needLoad) {
            const btnLoad = document.getElementById('btnLoadPayments');
            if (btnLoad) {
                btnLoad.click();
                let tries = 0;
                const waitInterval = setInterval(() => {
                    tries++;
                    const hasItems = container && container.querySelector('.pay-checkbox');
                    if (hasItems) {
                        clearInterval(waitInterval);
                        window.autoSelectPaymentByName("freedom");
                    } else if (tries > 20) clearInterval(waitInterval);
                }, 500);
            }
        } else {
            const anyChecked = container.querySelector('.pay-checkbox:checked');
            if (!anyChecked) window.autoSelectPaymentByName("freedom");
        }
    };

    document.querySelectorAll('#adsSubTabs .nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (e.target.dataset.target === 'postAdForm') {
                injectFundUI();
                window.loadAdFundBalance();
                window.autoLoadPaymentsAndPickFreedom();
                setTimeout(() => window.applyAllPostFormDefaults(), 300);
            }
        });
    });

});
