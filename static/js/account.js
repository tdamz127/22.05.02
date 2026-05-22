window.cachedAccountsByGroup = window.cachedAccountsByGroup || {};

document.addEventListener('DOMContentLoaded', () => {
    const groupSelect = document.getElementById('groupSelect');
    const accountsContainer = document.getElementById('accountsContainer');
    const actionBtn = document.getElementById('actionBtn');

    window.fetchGroupsInBackground = async function() {
        try {
            const res = await fetch('/api/groups');
            const data = await res.json();
            if(data.status === 'success') {
                const currentVal = groupSelect.value;
                groupSelect.innerHTML = '<option value="">-- Chọn --</option>';
                data.groups.forEach(g => groupSelect.add(new Option(g, g)));
                if (currentVal) groupSelect.value = currentVal;
            }
        } catch (err) {}
    };

    window.loadAccounts = async function(group, autoSelectIndex = null, forceRefresh = false) {
        currentGroup = group;
        selectedAccountIndex = null;
        selectedAccountName = '';
        if(!group) {
            accountsContainer.innerHTML = '<span class="text-muted">Vui lòng chọn nhóm...</span>';
            document.getElementById('accCount').textContent = '0';
            return;
        }

        if (!forceRefresh && window.cachedAccountsByGroup[group]) {
            renderAccounts(window.cachedAccountsByGroup[group], autoSelectIndex);
            return;
        }

        accountsContainer.innerHTML = '<span><i class="fas fa-spinner fa-spin"></i> Đang tải tài khoản...</span>';
        try {
            const res = await fetch('/api/accounts/' + group);
            const data = await res.json();
            if(data.status === 'success' && data.accounts.length > 0) {
                window.cachedAccountsByGroup[group] = data.accounts;
                renderAccounts(data.accounts, autoSelectIndex);
            } else {
                accountsContainer.innerHTML = '<span class="text-danger">Không có tài khoản!</span>';
            }
        } catch(err) { accountsContainer.innerHTML = '<span class="text-danger">Lỗi kết nối!</span>'; }
    };

    function renderAccounts(accounts, autoSelectIndex = null) {
        accountsContainer.innerHTML = '';
        document.getElementById('accCount').textContent = accounts.length;
        accounts.forEach((acc, index) => {
            const card = document.createElement('div');
            card.className = 'account-card' + (autoSelectIndex === index ? ' selected' : '');
            card.innerHTML = `<div class="acc-name"><i class="fas fa-user-circle text-primary"></i> ${acc.name} <span class="acc-api">(API: ${acc.api3_masked})</span></div><i class="fas fa-check-circle check-icon"></i>`;
            card.addEventListener('click', () => {
                document.querySelectorAll('.account-card').forEach(el => el.classList.remove('selected'));
                card.classList.add('selected');
                selectedAccountIndex = index;
                selectedAccountName = acc.name;
            });
            accountsContainer.appendChild(card);
        });
        if (autoSelectIndex !== null) {
            selectedAccountIndex = autoSelectIndex;
            selectedAccountName = accounts[autoSelectIndex].name;
        }
    }

    if (SERVER_CONFIG && SERVER_CONFIG.group) {
        fetchGroupsInBackground(); 
    } else {
        fetchGroupsInBackground();
    }

    if (SERVER_CONFIG && SERVER_CONFIG.is_locked) {
        lockUI(selectedAccountName);
        if(!isAdsTab && typeof fetchP2PData === 'function') {
            fetchP2PData(); 
            setupAutoRefreshTimer();
        }
    } else if (currentGroup) {
        loadAccounts(currentGroup, selectedAccountIndex);
    }

    groupSelect.addEventListener('change', async (e) => await loadAccounts(e.target.value));
    document.getElementById('refreshBtn').addEventListener('click', () => loadAccounts(groupSelect.value, null, true));

    actionBtn.addEventListener('click', async () => {
        const isSaving = (actionBtn.textContent === 'LƯU CẤU HÌNH');
        if (isSaving) {
            if (selectedAccountIndex === null) return showToast('Vui lòng chọn 1 tài khoản!', 'warning');
            const ip = document.getElementById('proxyIp').value.trim();
            const port = document.getElementById('proxyPort').value.trim();
            if (!ip || !port) return showToast('Vui lòng nhập Proxy!', 'warning');
            
            lockUI(selectedAccountName);
            await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getFullConfigState(true)) });
            showToast('Lưu cấu hình thành công!', 'success');
            
            if(!isAdsTab && typeof fetchP2PData === 'function') {
                fetchP2PData();
                setupAutoRefreshTimer();
            }
        } else {
            unlockUI();
            if (currentGroup) loadAccounts(currentGroup, selectedAccountIndex);
        }
    });
});