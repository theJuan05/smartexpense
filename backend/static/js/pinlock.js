// ── PIN LOCK ──────────────────────────────────────────────────
// 4-digit PIN — mobile only, required on app open + after 5 mins idle
// PIN is stored hashed in localStorage for basic security

const PIN_KEY        = 'smartexpense-pin';
const PIN_ENABLED    = 'smartexpense-pin-enabled';
const PIN_FAIL_KEY   = 'smartexpense-pin-fails';
const PIN_LOCK_KEY   = 'smartexpense-pin-lock-until';
const PIN_DIGITS     = 4;
const PIN_MAX_FAILS  = 3;
const PIN_LOCK_MS    = 5 * 60 * 1000; // 5 minutes
const IDLE_TIMEOUT   = 5 * 60 * 1000;

let pinBuffer       = '';
let idleTimer       = null;
let pinMode         = 'unlock'; // 'unlock' | 'set' | 'confirm'
let pinSetBuffer    = '';
let onUnlockSuccess = null;

// ── LOCKOUT HELPERS ───────────────────────────────────────────
function getPinFails()    { return parseInt(localStorage.getItem(PIN_FAIL_KEY)  || '0', 10); }
function getPinLockUntil(){ return parseInt(localStorage.getItem(PIN_LOCK_KEY)  || '0', 10); }
function isLockedOut()    { return Date.now() < getPinLockUntil(); }
function resetPinFails()  { localStorage.removeItem(PIN_FAIL_KEY); localStorage.removeItem(PIN_LOCK_KEY); }

// ── MOBILE CHECK ──────────────────────────────────────────────
function isMobileDevice() {
  return window.innerWidth <= 768 ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// ── SIMPLE HASH ───────────────────────────────────────────────
async function hashPIN(pin) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(pin + 'smartexpense-salt');
  const hash    = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── CHECK IF PIN IS ENABLED ───────────────────────────────────
function isPINEnabled() {
  return localStorage.getItem(PIN_ENABLED) === 'true';
}

// ── SHOW PIN OVERLAY ──────────────────────────────────────────
function showPINOverlay(mode = 'unlock', callback = null) {
  // Desktop — never show PIN overlay
  if (!isMobileDevice()) return;

  pinMode         = mode;
  pinBuffer       = '';
  if (mode !== 'confirm') pinSetBuffer = '';
  onUnlockSuccess = callback;

  const overlay   = document.getElementById('pin-overlay');
  const title     = document.getElementById('pin-title');
  const subtitle  = document.getElementById('pin-subtitle');
  const error     = document.getElementById('pin-error');
  const forgotBtn = document.getElementById('pin-forgot');

  if (!overlay) return;

  if (mode === 'unlock') {
    title.textContent       = '🔒 Enter PIN';
    subtitle.textContent    = 'Enter your 4-digit PIN to continue';
    forgotBtn.style.display = 'block';
  } else if (mode === 'set') {
    title.textContent       = '🔐 Set New PIN';
    subtitle.textContent    = 'Choose a 4-digit PIN to protect your app';
    forgotBtn.style.display = 'none';
  } else if (mode === 'confirm') {
    title.textContent       = '🔐 Confirm PIN';
    subtitle.textContent    = 'Enter your PIN again to confirm';
    forgotBtn.style.display = 'none';
  }

  error.textContent   = '';
  error.style.display = 'none';
  updatePINDots(0);

  overlay.classList.add('active');
  overlay.style.zIndex = '99999';

  if (mode === 'unlock' && isLockedOut()) {
    setTimeout(startLockoutCountdown, 50);
  }
}

function hidePINOverlay() {
  const overlay = document.getElementById('pin-overlay');
  if (overlay) overlay.classList.remove('active');
  pinBuffer = '';
  resetIdleTimer();
}

// ── UPDATE PIN DOTS ───────────────────────────────────────────
function updatePINDots(count) {
  document.querySelectorAll('.pin-dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < count);
  });
}

// ── HANDLE KEYPAD INPUT ───────────────────────────────────────
function handlePINInput(digit) {
  if (pinBuffer.length >= PIN_DIGITS) return;

  pinBuffer += digit;
  updatePINDots(pinBuffer.length);

  const dots = document.querySelectorAll('.pin-dot');
  const dot  = dots[pinBuffer.length - 1];
  if (dot) {
    dot.classList.add('bounce');
    setTimeout(() => dot.classList.remove('bounce'), 300);
  }

  if (pinBuffer.length === PIN_DIGITS) {
    setTimeout(() => processPIN(), 200);
  }
}

function handlePINDelete() {
  if (pinBuffer.length === 0) return;
  pinBuffer = pinBuffer.slice(0, -1);
  updatePINDots(pinBuffer.length);
}

// ── PROCESS COMPLETED PIN ─────────────────────────────────────
async function processPIN() {
  const errorEl = document.getElementById('pin-error');

  if (pinMode === 'unlock') {
    if (isLockedOut()) { pinBuffer = ''; updatePINDots(0); return; }

    const stored = localStorage.getItem(PIN_KEY);
    const hashed = await hashPIN(pinBuffer);

    if (hashed === stored) {
      resetPinFails();
      hidePINOverlay();
      if (typeof onUnlockSuccess === 'function') onUnlockSuccess();
    } else {
      const fails = getPinFails() + 1;
      localStorage.setItem(PIN_FAIL_KEY, fails);

      if (fails >= PIN_MAX_FAILS) {
        localStorage.setItem(PIN_LOCK_KEY, Date.now() + PIN_LOCK_MS);
        sendPinAlert();
        startLockoutCountdown();
      } else {
        const left = PIN_MAX_FAILS - fails;
        errorEl.textContent   = `❌ Wrong PIN. ${left} attempt${left === 1 ? '' : 's'} remaining.`;
        errorEl.style.display = 'block';
        shakePINDots();
      }
      pinBuffer = '';
      updatePINDots(0);
    }

  } else if (pinMode === 'set') {
    pinSetBuffer = pinBuffer;
    pinBuffer    = '';
    updatePINDots(0);
    showPINOverlay('confirm');

  } else if (pinMode === 'confirm') {
    if (pinBuffer === pinSetBuffer) {
      const hashed = await hashPIN(pinBuffer);
      localStorage.setItem(PIN_KEY,     hashed);
      localStorage.setItem(PIN_ENABLED, 'true');
      hidePINOverlay();
      showToast('✅ PIN set successfully!');
      updatePINSettingsUI();
    } else {
      errorEl.textContent   = '❌ PINs do not match. Try again.';
      errorEl.style.display = 'block';
      shakePINDots();
      pinBuffer    = '';
      pinSetBuffer = '';
      updatePINDots(0);
      setTimeout(() => showPINOverlay('set'), 1000);
    }
  }
}

// ── PIN LOCKOUT COUNTDOWN ─────────────────────────────────────
function startLockoutCountdown() {
  const errorEl = document.getElementById('pin-error');
  const keypad  = document.querySelector('.pin-keypad');
  if (keypad) keypad.style.pointerEvents = 'none';

  const tick = () => {
    const remaining = Math.ceil((getPinLockUntil() - Date.now()) / 1000);
    if (remaining <= 0) {
      resetPinFails();
      if (errorEl) { errorEl.textContent = ''; errorEl.style.display = 'none'; }
      if (keypad)  keypad.style.pointerEvents = '';
      updatePINDots(0);
      return;
    }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    if (errorEl) {
      errorEl.textContent   = `🔒 Too many attempts. Try again in ${m}:${String(s).padStart(2, '0')}`;
      errorEl.style.display = 'block';
    }
    setTimeout(tick, 1000);
  };
  tick();
}

// ── SEND PIN ALERT EMAIL ──────────────────────────────────────
async function sendPinAlert() {
  try {
    await fetch('/api/v1/pin-alert', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ device: navigator.userAgent })
    });
  } catch (_) {}
}

// ── SHAKE ANIMATION ───────────────────────────────────────────
function shakePINDots() {
  const dotsRow = document.querySelector('.pin-dots');
  if (!dotsRow) return;
  dotsRow.classList.add('shake');
  setTimeout(() => dotsRow.classList.remove('shake'), 500);
}

// ── FORGOT PIN ────────────────────────────────────────────────
function handleForgotPIN() {
  if (!confirm('Reset PIN? You will need to set a new one.')) return;
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(PIN_ENABLED);
  resetPinFails();
  hidePINOverlay();
  showToast('PIN has been reset.');
  updatePINSettingsUI();
}

// ── IDLE TIMER — mobile only ──────────────────────────────────
function resetIdleTimer() {
  clearTimeout(idleTimer);
  if (!isPINEnabled() || !isMobileDevice()) return;

  idleTimer = setTimeout(() => {
    showPINOverlay('unlock');
  }, IDLE_TIMEOUT);
}

function startIdleWatcher() {
  ['click','keydown','touchstart','mousemove','scroll'].forEach(evt => {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
  });
  resetIdleTimer();
}

// ── UPDATE SETTINGS UI ────────────────────────────────────────
function updatePINSettingsUI() {
  const toggle    = document.getElementById('pin-toggle');
  const status    = document.getElementById('pin-status');
  const changeBtn = document.getElementById('btn-change-pin');

  if (toggle)    toggle.checked           = isPINEnabled();
  if (status)    status.textContent       = isPINEnabled() ? 'PIN is enabled' : 'PIN is disabled';
  if (changeBtn) changeBtn.style.display  = isPINEnabled() ? 'flex' : 'none';
}

// ── ENABLE / DISABLE PIN ──────────────────────────────────────
function handlePINToggle(enabled) {
  if (enabled) {
    showPINOverlay('set');
  } else {
    if (isPINEnabled()) {
      showPINOverlay('unlock', () => {
        localStorage.removeItem(PIN_KEY);
        localStorage.setItem(PIN_ENABLED, 'false');
        showToast('🔓 PIN disabled.');
        updatePINSettingsUI();
      });
    }
  }
}

// ── CHANGE PIN ────────────────────────────────────────────────
function handleChangePIN() {
  if (isPINEnabled()) {
    showPINOverlay('unlock', () => {
      setTimeout(() => showPINOverlay('set'), 300);
    });
  } else {
    showPINOverlay('set');
  }
}

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('load', () => {

  // Keypad buttons
  document.querySelectorAll('.pin-key[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => handlePINInput(btn.dataset.digit));
  });

  // Delete button
  document.getElementById('pin-delete')
    ?.addEventListener('click', handlePINDelete);

  // Forgot PIN
  document.getElementById('pin-forgot')
    ?.addEventListener('click', handleForgotPIN);

  // Physical keyboard support
  document.addEventListener('keydown', e => {
    const overlay = document.getElementById('pin-overlay');
    if (!overlay?.classList.contains('active')) return;
    if (e.key >= '0' && e.key <= '9') handlePINInput(e.key);
    if (e.key === 'Backspace')         handlePINDelete();
  });

  // PIN toggle in settings
  document.getElementById('pin-toggle')
    ?.addEventListener('change', function () {
      handlePINToggle(this.checked);
      if (!this.checked) this.checked = isPINEnabled();
    });

  // Change PIN button
  document.getElementById('btn-change-pin')
    ?.addEventListener('click', handleChangePIN);

  // Update settings UI
  updatePINSettingsUI();

  // Lock on app open — MOBILE ONLY
  if (isPINEnabled() && isMobileDevice()) {
    showPINOverlay('unlock');
  }

  // Start idle watcher
  startIdleWatcher();

});