// pwa.js — PWA install and offline management

let deferredPrompt = null;

// Listen for install prompt
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;

  // Desktop install button
  const btn = document.getElementById('btn-install');
  if (btn) { btn.style.display = 'block'; btn.addEventListener('click', handleInstall); }

  // Mobile install banner
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'flex';

  console.log('[PWA] Install prompt ready');
});

// Handle install button click
async function handleInstall() {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;

  if (result.outcome === 'accepted') {
    console.log('[PWA] App installed!');
    showToast('App installed successfully!');
  } else {
    console.log('[PWA] Install dismissed');
  }

  deferredPrompt = null;
  const btn = document.getElementById('btn-install');
  if (btn) btn.style.display = 'none';
}

// App installed event
window.addEventListener('appinstalled', function() {
  console.log('[PWA] App was installed');
  showToast('SmartExpense AI Pro installed!');
  const btn    = document.getElementById('btn-install');
  const banner = document.getElementById('install-banner');
  if (btn)    btn.style.display = 'none';
  if (banner) banner.style.display = 'none';
  deferredPrompt = null;
});

function _showInstallGuide() {
  const modal   = document.getElementById('modal-install-guide');
  const android = document.getElementById('install-guide-android');
  const ios     = document.getElementById('install-guide-ios');
  if (!modal) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (android) android.style.display = isIOS ? 'none' : 'block';
  if (ios)     ios.style.display     = isIOS ? 'block' : 'none';
  modal.style.display = 'flex';
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
    showToast('You are offline - all data saved locally', 'warning');
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
      console.log('[PWA] Background sync registered');
    } catch (err) {
      console.warn('[PWA] Background sync not supported:', err);
    }
  }
}

// Wire up install banner buttons
document.addEventListener('DOMContentLoaded', function() {
  const bannerBtn   = document.getElementById('btn-install-banner');
  const bannerClose = document.getElementById('btn-install-banner-close');
  const banner      = document.getElementById('install-banner');

  if (bannerBtn)   bannerBtn.addEventListener('click', handleInstall);
  if (bannerClose && banner) bannerClose.addEventListener('click', function() {
    banner.style.display = 'none';
  });

  // More-sheet install button — native prompt or step-by-step guide
  const btnMobile = document.getElementById('btn-install-mobile');
  if (btnMobile) {
    if (isInstalledPWA()) {
      btnMobile.style.display = 'none';
    } else {
      btnMobile.addEventListener('click', function() {
        if (deferredPrompt) {
          handleInstall();
        } else {
          _showInstallGuide();
        }
      });
    }
  }
});

// Initialize PWA features
function initPWA() {
  if (isInstalledPWA()) {
    console.log('[PWA] Running as installed app');
    document.body.classList.add('pwa-mode');
  }

  if (navigator.onLine) {
    registerBackgroundSync();
  }

  window.addEventListener('online', function() {
    updateOfflineUI(false);
    registerBackgroundSync();
  });

  window.addEventListener('offline', function() {
    updateOfflineUI(true);
  });
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/service-worker.js')
      .then(function(reg) {
        console.log('[PWA] Service Worker registered:', reg.scope);
      })
      .catch(function(err) {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
}

// Initialize
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

  // Close sheet and navigate when a sheet item is tapped
  sheet.querySelectorAll('.more-sheet-item').forEach(function (item) {
    item.addEventListener('click', function () {
      closeSheet();
      // Mark More button as open when Insights/Advice is active
      btn.classList.add('open');
    });
  });

  // If a main nav tab is clicked, remove the "open" highlight from More
  document.querySelectorAll('.bottom-nav .tab-btn').forEach(function (navBtn) {
    navBtn.addEventListener('click', function () {
      btn.classList.remove('open');
    });
  });
})();