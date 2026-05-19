// pwa.js — PWA install and offline management

let deferredPrompt = null;

// Listen for install prompt — only show card when Chrome says app is installable
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
  window._dip = e;

  // Only show if not already in standalone mode
  if (!isInstalledPWA()) {
    const card = document.getElementById('install-card');
    if (card) card.style.display = 'flex';
  }

  console.log('[PWA] Install prompt ready');
});

// Handle install button click (native Chrome prompt)
async function handleInstall() {
  if (!deferredPrompt) {
    showInstallGuide();
    return;
  }
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  if (result.outcome === 'accepted') {
    showToast('App installed successfully!', 'success');
  }
  deferredPrompt = null;
  window._dip = null;
  const card = document.getElementById('install-card');
  if (card) card.style.display = 'none';
}

// App installed event
window.addEventListener('appinstalled', function() {
  showToast('SmartExpense installed!', 'success');
  window._dip = null;
  const card = document.getElementById('install-card');
  if (card) card.style.display = 'none';
  deferredPrompt = null;
});

// Show install guide modal — called from onclick
function showInstallGuide() {
  if (deferredPrompt) {
    handleInstall();
    return;
  }
  const modal   = document.getElementById('modal-install-guide');
  if (!modal) return;
  const android = document.getElementById('install-guide-android');
  const ios     = document.getElementById('install-guide-ios');
  const isIOS   = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (android) android.style.display = isIOS ? 'none' : 'block';
  if (ios)     ios.style.display     = isIOS ? 'block' : 'none';
  modal.style.display = 'flex';
}

function closeInstallGuide() {
  const modal = document.getElementById('modal-install-guide');
  if (modal) modal.style.display = 'none';
}

// Check if running as installed PWA
function isInstalledPWA() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

// Show offline indicator
function updateOfflineUI(isOffline) {
  const badge = document.getElementById('status-badge');
  if (!badge) return;
  if (isOffline) {
    badge.textContent = 'Offline';
    badge.className   = 'status-badge offline';
    showToast('You are offline — data saved locally', 'warning');
  } else {
    badge.textContent = 'Online';
    badge.className   = 'status-badge online';
  }
}

// Register background sync
async function registerBackgroundSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const sw = await navigator.serviceWorker.ready;
      await sw.sync.register('sync-expenses');
    } catch (_) {}
  }
}

// Show install card on iOS (beforeinstallprompt never fires on iOS)
// and hide it if already running as installed PWA
document.addEventListener('DOMContentLoaded', function() {
  const card = document.getElementById('install-card');
  if (!card) return;
  if (isInstalledPWA()) {
    card.style.display = 'none';
    return;
  }
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) card.style.display = 'flex';
});

// Also hide when matchMedia changes (user installs while page is open)
window.matchMedia('(display-mode: standalone)').addEventListener('change', function(e) {
  if (e.matches) {
    const card = document.getElementById('install-card');
    if (card) card.style.display = 'none';
  }
});

// Initialize PWA features
function initPWA() {
  if (isInstalledPWA()) {
    document.body.classList.add('pwa-mode');
  }
  if (navigator.onLine) registerBackgroundSync();
  window.addEventListener('online',  function() { updateOfflineUI(false); registerBackgroundSync(); });
  window.addEventListener('offline', function() { updateOfflineUI(true); });
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js')
      .then(function(reg) { console.log('[PWA] SW registered:', reg.scope); })
      .catch(function(err) { console.warn('[PWA] SW registration failed:', err); });
  });
}

initPWA();

// ── More Sheet ────────────────────────────────────────────────
(function () {
  const btn      = document.getElementById('btn-more-menu');
  const sheet    = document.getElementById('more-sheet');
  const backdrop = document.getElementById('more-sheet-backdrop');
  if (!btn || !sheet || !backdrop) return;

  function openSheet() {
    sheet.classList.add('open');
    backdrop.classList.add('open');
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    sheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    sheet.setAttribute('aria-hidden', 'true');
  }

  btn.addEventListener('click', function () {
    sheet.classList.contains('open') ? closeSheet() : openSheet();
  });

  backdrop.addEventListener('click', closeSheet);

  sheet.querySelectorAll('.more-sheet-item').forEach(function (item) {
    item.addEventListener('click', function () {
      closeSheet();
      btn.classList.add('open');
    });
  });

  document.querySelectorAll('.bottom-nav .tab-btn').forEach(function (navBtn) {
    navBtn.addEventListener('click', function () {
      btn.classList.remove('open');
    });
  });
})();
