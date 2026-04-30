// ── PROFILE & SETTINGS ───────────────────────────────────────
const PROFILE_KEY = 'smartexpense-profile';

// ── LOAD PROFILE FROM LOCALSTORAGE ───────────────────────────
function loadProfile() {
  const defaults = {
    username: '',
    email:    '',
    phone:    '',
    password: '',
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

// ── RENDER PROFILE UI ─────────────────────────────────────────
function renderProfile() {
  const p = loadProfile();

  // Header
  document.getElementById('profile-avatar-display').textContent = p.avatar  || '👤';
  document.getElementById('profile-name-display').textContent   = p.username || 'Your Name';
  document.getElementById('profile-email-display').textContent  = p.email    || 'your@email.com';
  document.getElementById('profile-since').textContent          = p.since    || '—';

  // Account fields
  document.getElementById('display-username').textContent = p.username || 'Not set';
  document.getElementById('display-email').textContent    = p.email    || 'Not set';
  document.getElementById('display-phone').textContent    = p.phone    || 'Not set';
  document.getElementById('display-currency').textContent = p.currency || 'PHP (₱)';

  // Dark mode toggle sync
  const darkToggle = document.getElementById('settings-dark-toggle');
  if (darkToggle) {
    darkToggle.checked = localStorage.getItem('smartexpense-dark-mode') === 'true';
  }
}

// ── OPEN / CLOSE MODALS ───────────────────────────────────────
function openProfileModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeProfileModal(id) {
  document.getElementById(id).classList.remove('active');
  // Clear password fields
  ['input-current-password','input-new-password',
   'input-confirm-password'].forEach(f => {
    const el = document.getElementById(f);
    if (el) el.value = '';
  });
  const errEl = document.getElementById('password-error');
  if (errEl) errEl.style.display = 'none';
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

  else if (field === 'phone') {
    const val = document.getElementById('input-phone').value.trim();
    p.phone = val;
    closeProfileModal('modal-edit-phone');
  }

  else if (field === 'password') {
    const current = document.getElementById('input-current-password').value;
    const newPass = document.getElementById('input-new-password').value;
    const confirm = document.getElementById('input-confirm-password').value;
    const errEl   = document.getElementById('password-error');

    if (p.password && current !== p.password) {
      errEl.textContent    = '❌ Current password is incorrect.';
      errEl.style.display  = 'block';
      return;
    }
    if (newPass.length < 6) {
      errEl.textContent    = '❌ Password must be at least 6 characters.';
      errEl.style.display  = 'block';
      return;
    }
    if (newPass !== confirm) {
      errEl.textContent    = '❌ Passwords do not match.';
      errEl.style.display  = 'block';
      return;
    }
    p.password = newPass;
    closeProfileModal('modal-edit-password');
    showToast('✅ Password updated successfully!');
  }

  saveProfile(p);
  renderProfile();
  if (field !== 'password') showToast('✅ Saved successfully!');
}

// ── AVATAR ────────────────────────────────────────────────────
function selectAvatar(emoji) {
  const p  = loadProfile();
  p.avatar = emoji;
  saveProfile(p);
  renderProfile();
  closeProfileModal('modal-edit-avatar');
  showToast('✅ Avatar updated!');
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

function backupData() {
  try {
    const data = {
      profile:  JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'),
      exported: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)],
                          { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `smartexpense-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ Backup downloaded!');
  } catch (e) {
    showToast('❌ Backup failed.');
  }
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  renderProfile();

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

  document.getElementById('open-edit-phone')
    ?.addEventListener('click', () => {
      const p = loadProfile();
      document.getElementById('input-phone').value = p.phone || '';
      openProfileModal('modal-edit-phone');
    });

  document.getElementById('btn-change-avatar')
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

  // Danger zone
  document.getElementById('btn-clear-expenses')
    ?.addEventListener('click', () => confirmDanger(
      'This will permanently delete ALL your expense records. This cannot be undone.',
      () => {
        localStorage.removeItem('expenses');
        showToast('🗑️ All expenses cleared.');
      }
    ));

  document.getElementById('btn-clear-budgets')
    ?.addEventListener('click', () => confirmDanger(
      'This will permanently delete ALL your budget settings. This cannot be undone.',
      () => {
        localStorage.removeItem('budgets');
        showToast('🗑️ All budgets cleared.');
      }
    ));

  document.getElementById('btn-reset-app')
    ?.addEventListener('click', () => confirmDanger(
      'This will wipe ALL data including expenses, budgets, and your profile. This cannot be undone.',
      () => {
        localStorage.clear();
        showToast('🔄 App reset. Refreshing...');
        setTimeout(() => location.reload(), 1500);
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
    });

});