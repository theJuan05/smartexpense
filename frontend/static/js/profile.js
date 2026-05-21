// ── PROFILE & SETTINGS ───────────────────────────────────────
const PROFILE_KEY  = 'smartexpense-profile';
const PROFILE_PIC_KEY = 'smartexpense-profile-pic';

// ── LOAD PROFILE FROM LOCALSTORAGE ───────────────────────────
function loadProfile() {
  const defaults = {
    username: '',
    email:    '',
    avatar:   '👤',
    currency: 'PHP (₱)',
    since:    new Date().toLocaleDateString('en-PH', { year:'numeric', month:'long' })
  };
  const saved = localStorage.getItem(PROFILE_KEY);
  return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
}

// ── SAVE PROFILE TO LOCALSTORAGE ─────────────────────────────
function saveProfile(data) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
}

// ── RENDER PROFILE UI ─────────────────────���───────────────────
function renderProfile() {
  const p   = loadProfile();
  const pic = localStorage.getItem(PROFILE_PIC_KEY);
  const avatarEl = document.getElementById('profile-avatar-display');

  // Show photo or emoji
  if (pic) {
    avatarEl.innerHTML = `<img src="${pic}" alt="Profile photo" class="profile-avatar-photo">`;
  } else {
    avatarEl.textContent = p.avatar || '👤';
  }

  // Show/hide "Remove photo" button in modal
  const removeBtn = document.getElementById('btn-remove-photo');
  if (removeBtn) removeBtn.style.display = pic ? 'inline-flex' : 'none';

  document.getElementById('profile-name-display').textContent  = p.username || 'Your Name';
  const sidebarName = document.getElementById('sidebar-user-name');
  if (sidebarName) sidebarName.textContent = p.username || 'My Account';
  document.getElementById('profile-email-display').textContent = p.email    || 'your@email.com';
  document.getElementById('profile-since').textContent         = p.since    || '—';

  // Account fields
  document.getElementById('display-username').textContent = p.username || 'Not set';
  document.getElementById('display-email').textContent    = p.email    || 'Not set';
  document.getElementById('display-currency').textContent = p.currency || 'PHP (₱)';

  // Dark mode toggle sync
  const darkToggle = document.getElementById('settings-dark-toggle');
  if (darkToggle) {
    darkToggle.checked = localStorage.getItem('smartexpense-dark-mode') === 'true';
  }
}

// ── OPEN / CLOSE MODALS ───────────────────────────────────────
function openProfileModal(id) {
  openModal(id);
}

function closeProfileModal(id) {
  // Reset password modal back to step 1
  ['input-current-password','input-new-password',
   'input-confirm-password'].forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = '';
  });
  ['password-error','pw-verify-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const s1 = document.getElementById('pw-step-1');
  const s2 = document.getElementById('pw-step-2');
  const lbl = document.getElementById('pw-step-label');
  const ttl = document.getElementById('modal-edit-password-title');
  if (s1) s1.style.display = '';
  if (s2) s2.style.display = 'none';
  if (lbl) lbl.textContent = 'Step 1 of 2';
  if (ttl) ttl.textContent = 'Verify Identity';
  closeModal(id);
}

// ── SAVE PROFILE FIELD ────────────────────────────────────────
function saveProfileField(field) {
  const p = loadProfile();

  if (field === 'username') {
    const val = document.getElementById('input-username').value.trim();
    if (!val) { showToast('⚠️ Username cannot be empty.'); return; }
    p.username = val;
    closeProfileModal('modal-edit-name');
  }

  else if (field === 'email') {
    const val = document.getElementById('input-email').value.trim();
    if (!val || !val.includes('@')) { showToast('⚠️ Enter a valid email.'); return; }
    p.email = val;
    closeProfileModal('modal-edit-email');
  }

  else if (field === 'password') {
    const current = document.getElementById('input-current-password').value;
    const newPass = document.getElementById('input-new-password').value;
    const confirm = document.getElementById('input-confirm-password').value;
    const errEl   = document.getElementById('password-error');
    const btn     = document.querySelector('#modal-edit-password .btn-primary');

    if (btn) btn.disabled = true;

    fetch('/api/v1/user/change-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        current_password: current,
        new_password:     newPass,
        confirm_password: confirm,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.status === 'success') {
          closeProfileModal('modal-edit-password');
          showToast('✅ Password updated successfully!');
        } else {
          errEl.textContent   = '❌ ' + data.message;
          errEl.style.display = 'block';
        }
      })
      .catch(() => {
        errEl.textContent   = '❌ Network error. Please try again.';
        errEl.style.display = 'block';
      })
      .finally(() => {
        if (btn) btn.disabled = false;
      });

    return;
  }

  saveProfile(p);
  renderProfile();
  showToast('✅ Saved successfully!');
}

// ── AVATAR ────────────────────────────────────────────────────
function selectAvatar(emoji) {
  const p  = loadProfile();
  p.avatar = emoji;
  saveProfile(p);
  localStorage.removeItem(PROFILE_PIC_KEY);
  renderProfile();
  closeProfileModal('modal-edit-avatar');
  showToast('✅ Avatar updated!');
}

function removeProfilePhoto() {
  localStorage.removeItem(PROFILE_PIC_KEY);
  renderProfile();
  closeProfileModal('modal-edit-avatar');
  showToast('✅ Photo removed.');
  fetch('/api/v1/user/profile-pic', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ pic: null }),
  }).catch(() => {});
}

function handleProfilePicUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('❌ Please select a valid image file.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('❌ Image must be under 5 MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const MAX    = 200;
      let w = img.width;
      let h = img.height;

      if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
      else       { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }

      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        localStorage.setItem(PROFILE_PIC_KEY, dataUrl);
        renderProfile();
        closeProfileModal('modal-edit-avatar');
        showToast('✅ Profile photo updated!');
        fetch('/api/v1/user/profile-pic', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ pic: dataUrl }),
        }).catch(() => {});
      } catch (_) {
        showToast('❌ Could not save photo. Try a smaller image.');
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── DANGER ZONE ───────────────────────────────────────────────
let pendingDangerAction = null;

function confirmDanger(message, action) {
  document.getElementById('danger-confirm-text').textContent = message;
  pendingDangerAction = action;
  openProfileModal('modal-confirm-danger');
}

function executeDangerAction() {
  if (typeof pendingDangerAction === 'function') {
    pendingDangerAction();
  }
  closeProfileModal('modal-confirm-danger');
  pendingDangerAction = null;
}

// ── EXPORT CSV (placeholder — full version in export.js) ──────
function exportCSV() {
  showToast('📊 Export CSV coming soon!');
}

function exportPDF() {
  showToast('📄 Export PDF coming soon!');
}

async function backupData() {
  try {
    showToast('Preparing backup…');

    // Fetch all expenses from server
    let expenses = [];
    try {
      const res = await fetch('/api/v1/expenses');
      if (res.ok) {
        const json = await res.json();
        expenses = json.data || [];
      }
    } catch (_) {}

    // Fetch budgets
    let budgets = [];
    try {
      const res = await fetch('/api/v1/budgets/summary');
      if (res.ok) {
        const json = await res.json();
        budgets = json.data || [];
      }
    } catch (_) {}

    const data = {
      version:  '1.0',
      exported: new Date().toISOString(),
      profile:  JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'),
      settings: {
        monthly_income: localStorage.getItem('se_income'),
        theme:          localStorage.getItem('theme'),
      },
      expenses,
      budgets,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)],
                          { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `smartexpense-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✅ Backup downloaded! (${expenses.length} expenses)`);
  } catch (e) {
    showToast('❌ Backup failed.');
  }
}

async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.expenses || !Array.isArray(data.expenses)) {
      showToast('❌ Invalid backup file.', 'error');
      return;
    }

    const total = data.expenses.length;
    if (total === 0) {
      showToast('No expenses found in backup file.', 'warning');
      return;
    }

    showToast(`Importing ${total} expenses…`);

    let imported = 0, skipped = 0;
    for (const exp of data.expenses) {
      try {
        const res = await fetch('/api/v1/expenses', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title:          exp.title          || 'Imported expense',
            amount:         parseFloat(exp.amount) || 0,
            category:       exp.category       || 'Others',
            expense_date:   exp.expense_date   || new Date().toISOString().split('T')[0],
            notes:          exp.notes          || '',
            payment_method: exp.payment_method || 'cash',
          }),
        });
        if (res.ok) imported++;
        else skipped++;
      } catch (_) { skipped++; }
    }

    showToast(`✅ Imported ${imported} expenses${skipped ? `, ${skipped} skipped` : ''}.`, 'success');

    // Refresh expense list and stats
    if (typeof pullExpensesFromServer === 'function') await pullExpensesFromServer();
    if (typeof loadExpenseList       === 'function') await loadExpenseList();
    if (typeof refreshStats          === 'function') await refreshStats();

  } catch (e) {
    showToast('❌ Could not read backup file.', 'error');
  }
}

// ── SYNC ACCOUNT EMAIL/NAME FROM SERVER ──────────────────────
async function syncAccountFromServer() {
  try {
    const res = await fetch('/api/v1/auth/status');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.logged_in) return;

    const p = loadProfile();
    let changed = false;
    if (data.user_email && p.email !== data.user_email) {
      p.email = data.user_email;
      changed = true;
    }
    if (data.user_name && !p.username) {
      p.username = data.user_name;
      changed = true;
    }
    if (changed) {
      saveProfile(p);
      renderProfile();
    }
  } catch (_) {}

  // Sync profile picture from server — covers cross-device logins
  try {
    const picRes  = await fetch('/api/v1/user/profile-pic');
    if (!picRes.ok) return;
    const picData = await picRes.json();
    if (picData.pic) {
      const local = localStorage.getItem(PROFILE_PIC_KEY);
      if (local !== picData.pic) {
        localStorage.setItem(PROFILE_PIC_KEY, picData.pic);
        renderProfile();
      }
    }
  } catch (_) {}
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  renderProfile();
  syncAccountFromServer();

  // Account settings click handlers
  document.getElementById('open-edit-name')
    ?.addEventListener('click', () => {
      const p = loadProfile();
      document.getElementById('input-username').value = p.username || '';
      openProfileModal('modal-edit-name');
    });

  document.getElementById('open-edit-email')
    ?.addEventListener('click', () => {
      const p = loadProfile();
      document.getElementById('input-email').value = p.email || '';
      openProfileModal('modal-edit-email');
    });

  document.getElementById('open-edit-password')
    ?.addEventListener('click', () => openProfileModal('modal-edit-password'));

  // Use delegation so it works on mobile where DOM order matters
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#btn-pw-verify')) return;
    const pw    = document.getElementById('input-current-password')?.value;
    const errEl = document.getElementById('pw-verify-error');
    const btn   = document.getElementById('btn-pw-verify');
    if (!pw) { errEl.textContent = 'Please enter your current password.'; errEl.style.display = 'block'; return; }
    btn.disabled = true;
    btn.textContent = 'Verifying…';
    try {
      const res  = await fetch('/api/v1/user/verify-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        document.getElementById('pw-step-1').style.display = 'none';
        document.getElementById('pw-step-2').style.display = '';
        document.getElementById('pw-step-label').textContent = 'Step 2 of 2';
        document.getElementById('modal-edit-password-title').textContent = 'Set New Password';
        document.getElementById('input-new-password')?.focus();
      } else {
        errEl.textContent   = data.message || 'Incorrect password.';
        errEl.style.display = 'block';
      }
    } catch (_) {
      errEl.textContent   = 'Verification failed. Try again.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Verify & Continue';
    }
  });

  document.getElementById('btn-change-avatar')
    ?.addEventListener('click', () => openProfileModal('modal-edit-avatar'));

  // File input — triggered by the label inside the modal
  document.getElementById('profile-pic-input')
    ?.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        handleProfilePicUpload(this.files[0]);
        this.value = ''; // reset so same file can be re-selected
      }
    });

  // Also allow clicking the avatar circle itself to open the modal
  document.getElementById('profile-avatar-display')
    ?.addEventListener('click', () => openProfileModal('modal-edit-avatar'));

  // Dark mode toggle inside settings
  document.getElementById('settings-dark-toggle')
    ?.addEventListener('change', function () {
      if (this.checked) enableDarkMode();
      else disableDarkMode();
    });

  // Data management
  document.getElementById('btn-export-csv-settings')
    ?.addEventListener('click', exportCSV);

  document.getElementById('btn-export-pdf-settings')
    ?.addEventListener('click', exportPDF);

  document.getElementById('btn-backup-settings')
    ?.addEventListener('click', backupData);

  document.getElementById('btn-import-settings')
    ?.addEventListener('click', () => document.getElementById('import-file-input')?.click());

  document.getElementById('import-file-input')
    ?.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        importData(this.files[0]);
        this.value = '';
      }
    });

  // Danger zone
  document.getElementById('btn-clear-expenses')
    ?.addEventListener('click', () => confirmDanger(
      'This will permanently delete ALL your expense records. This cannot be undone.',
      async () => {
        const result = await API.request('/expenses', 'DELETE');
        if (result && result.status === 'success') {
          await clearAllExpensesLocal();
          showToast('All expenses cleared.');
          if (typeof renderExpenses === 'function') await renderExpenses();
          if (typeof renderRecentTransactions === 'function') renderRecentTransactions();
        } else {
          showToast('Failed to clear expenses', 'warning');
        }
      }
    ));

  document.getElementById('btn-clear-budgets')
    ?.addEventListener('click', () => confirmDanger(
      'This will permanently delete ALL your budget settings. This cannot be undone.',
      async () => {
        const result = await API.request('/budgets', 'DELETE');
        if (result && result.status === 'success') {
          showToast('All budgets cleared.');
          if (typeof loadBudgetSummary === 'function') await loadBudgetSummary();
        } else {
          showToast('Failed to clear budgets', 'warning');
        }
      }
    ));

  document.getElementById('btn-reset-app')
    ?.addEventListener('click', () => confirmDanger(
      'This will wipe ALL data including expenses, budgets, and your profile. This cannot be undone.',
      async () => {
        await Promise.allSettled([
          API.request('/expenses', 'DELETE'),
          API.request('/budgets', 'DELETE')
        ]);
        await clearAllExpensesLocal();
        localStorage.clear();
        showToast('App reset. Refreshing...');
        setTimeout(() => location.reload(), 1500);
      }
    ));

  document.getElementById('btn-delete-account')
    ?.addEventListener('click', () => confirmDanger(
      'This will permanently delete your account, all expenses, and all budgets. You cannot undo this.',
      async () => {
        const res = await API.request('/user/delete', 'DELETE');
        if (res && res.status === 'success') {
          await clearAllExpensesLocal();
          localStorage.clear();
          window.location.href = '/';
        } else {
          showToast('Failed to delete account. Try again.', 'warning');
        }
      }
    ));

  document.getElementById('btn-confirm-danger-action')
    ?.addEventListener('click', executeDangerAction);

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('active');
    });
  });

  // Profile icon in navbar
  document.getElementById('btn-profile-icon')
    ?.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-profile').classList.add('active');
      renderProfile();
      if (typeof updateThemePicker === 'function') updateThemePicker();
      updateNotifPermissionStatus();
    });

  // Push Notifications enable button
  updateNotifPermissionStatus();
  document.getElementById('btn-enable-notifications')
    ?.addEventListener('click', () => requestNotificationPermission(true));

  // Trigger budget reminders now
  document.getElementById('btn-trigger-reminders')
    ?.addEventListener('click', triggerRemindersNow);

});

// ── PUSH NOTIFICATION PERMISSION ─────────────────────────────
function _isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
function _isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

function updateNotifPermissionStatus() {
  const el = document.getElementById('notif-permission-status');
  if (!el) return;
  if (!('Notification' in window)) {
    if (_isIOS() && !_isStandalone()) {
      el.textContent = 'Open from home screen icon first';
    } else {
      el.textContent = 'Not supported — try Chrome';
    }
    el.style.color = 'var(--color-danger, #ef4444)';
    return;
  }
  if (Notification.permission === 'granted') {
    el.textContent = 'Enabled';
    el.style.color = 'var(--color-success, #22c55e)';
  } else if (Notification.permission === 'denied') {
    el.textContent = 'Blocked — allow in phone settings';
    el.style.color = 'var(--color-danger, #ef4444)';
  } else {
    el.textContent = 'Tap to enable';
    el.style.color = '';
  }
}


async function sendTestNotification() {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    alert('Notifications are not enabled yet.\n\nTap "Push Notifications" above first, then allow when prompted.');
    return;
  }

  const btn = document.getElementById('btn-test-notification');
  const origText = btn?.querySelector('.settings-value')?.textContent;
  if (btn) btn.querySelector('.settings-value').textContent = 'Registering…';

  // Always re-register the FCM token before testing — ensures the phone is in push_tokens table
  if (typeof initFirebaseMessaging === 'function') {
    await initFirebaseMessaging();
  }

  if (btn) btn.querySelector('.settings-value').textContent = 'Sending…';

  // Try FCM server push (works when app is open OR closed)
  try {
    const res  = await fetch('/api/v1/push-test', { method: 'POST' });
    const data = await res.json();
    if (data.status === 'success') {
      showToast('Test push sent to ' + (data.devices || 1) + ' device(s) — check your notifications!', 'success');
    } else {
      alert('Push test failed: ' + (data.message || 'unknown error') + '\n\nMake sure you tapped "Push Notifications" and allowed it first.');
    }
  } catch (_) {
    alert('Could not reach server. Make sure you are online.');
  }

  if (btn && origText) btn.querySelector('.settings-value').textContent = origText;
}

async function triggerRemindersNow() {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    alert('Notifications are not enabled yet.\n\nTap "Push Notifications" above first, then allow when prompted.');
    return;
  }

  const btn      = document.getElementById('btn-trigger-reminders');
  const valueEl  = btn?.querySelector('.settings-value');
  if (valueEl) valueEl.textContent = 'Sending…';

  try {
    const res  = await fetch('/api/v1/send-reminders', { method: 'POST' });
    const data = await res.json();
    if (data.status === 'success') {
      showToast('Budget reminders sent to all your devices!', 'success');
    } else {
      alert('Server error: ' + (data.message || 'unknown error'));
    }
  } catch (_) {
    alert('Failed to reach server — make sure you are online.');
  }

  if (valueEl) valueEl.textContent = 'Trigger all budget notifications instantly';
}