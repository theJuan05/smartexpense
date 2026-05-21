const CACHE_NAME = 'smartexpense-v68';
const STATIC_ASSETS = [
  '/static/style.css?v=65',
  '/static/profile.css',
  '/static/pinlock.css',
  '/static/js/darkmode.js',
  '/static/js/db.js',
  '/static/js/api.js',
  '/static/js/charts.js',
  '/static/js/budget.js',
  '/static/js/predict.js',
  '/static/js/anomaly.js',
  '/static/js/advice.js',
  '/static/js/pwa.js',
  '/static/js/scanner.js',
  '/static/js/export.js',
  '/static/js/edit-expense.js',
  '/static/js/profile.js',
  '/static/js/pinlock.js',
  '/static/js/firebase.js',
  '/static/js/templates.js',
  '/static/js/goals.js',
  '/static/js/app.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/logo-icon.svg',
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Failed to cache:', url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return caches.open(CACHE_NAME).then(function(cache) {
        return fetch('/').then(function(resp) {
          if (resp && resp.status === 200) return cache.put('/', resp);
        }).catch(function() {});
      });
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  const url  = event.request.url;
  const path = new URL(url).pathname;

  // Never intercept API calls, auth, or external services
  if (url.includes('/api/') ||
      url.includes('cdnjs.cloudflare.com') ||
      url.includes('gstatic.com') ||
      url.includes('googleapis.com') ||
      url.includes('firebaseapp.com') ||
      url.includes('firebasestorage.app') ||
      url.includes('firebaseio.com') ||
      url.includes('generativelanguage.googleapis.com') ||
      path === '/login' ||
      path === '/register' ||
      path === '/logout' ||
      path.startsWith('/verify-email') ||
      path.startsWith('/forgot-password') ||
      path.startsWith('/reset-password')) {
    return;
  }

  // ── Navigation: cache-first, refresh in background ──────────
  // Cached page is returned instantly. Network fetch updates cache silently.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/', { ignoreSearch: true }).then(function(cached) {
        fetch(event.request).then(function(resp) {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) { cache.put('/', resp.clone()); });
          }
        }).catch(function() {});

        if (cached) return cached;

        return fetch(event.request).catch(function() {
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>SmartExpense — Offline</title>' +
            '<style>body{font-family:sans-serif;display:flex;align-items:center;' +
            'justify-content:center;min-height:100vh;margin:0;background:#f0f0ff;}' +
            '.box{text-align:center;padding:32px;}h2{color:#6c4fff;}' +
            'p{color:#666;}button{background:#6c4fff;color:#fff;border:none;' +
            'padding:12px 24px;border-radius:8px;font-size:1rem;cursor:pointer;}' +
            '</style></head><body><div class="box">' +
            '<h2>You\'re offline</h2>' +
            '<p>Open SmartExpense while connected at least once<br>to enable full offline access.</p>' +
            '<button onclick="location.reload()">Try again</button>' +
            '</div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      })
    );
    return;
  }

  // ── CSS: network-first (always fresh), cache as offline fallback ─
  if (path.endsWith('.css')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, response.clone());
          });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || new Response('', { status: 503 });
        });
      })
    );
    return;
  }

  // ── JS: cache-first, refresh in background ───────────────────
  if (path.endsWith('.js')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, response.clone());
            });
          }
        }).catch(function() {});
        if (cached) return cached;
        return fetch(event.request).catch(function() {
          return new Response('', { status: 503 });
        });
      })
    );
    return;
  }

  // ── Images/icons: stale-while-revalidate ────────────────────
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      var networkPromise = fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, response.clone());
          });
        }
        return response;
      }).catch(function() {});
      return cached || networkPromise;
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(function(cache) {
        return Promise.all(
          event.data.urls.map(function(url) {
            return fetch(url).then(function(resp) {
              if (resp && resp.status === 200) return cache.put(url, resp);
            }).catch(function() {});
          })
        );
      })
    );
  }
});

self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-expenses') {
    console.log('[SW] Background sync triggered');
  }
});
