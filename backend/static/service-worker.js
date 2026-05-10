const CACHE_NAME = 'smartexpense-v34';
const STATIC_ASSETS = [
  '/static/style.css',
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
  console.log('[SW] Installing v34...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
      );
    }).then(function() {
      // Cache the app shell immediately after clearing old caches
      return caches.open(CACHE_NAME).then(function(cache) {
        return fetch('/').then(function(resp) {
          if (resp && resp.status === 200) {
            console.log('[SW] App shell cached ✅');
            return cache.put('/', resp);
          }
        }).catch(function() {});
      });
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  const url  = event.request.url;
  const path = new URL(url).pathname;

  // Never intercept: API calls, auth routes, CDNs, AI endpoints
  if (url.includes('/api/') ||
      url.includes('cdnjs.cloudflare.com') ||
      url.includes('gstatic.com') ||
      url.includes('generativelanguage.googleapis.com') ||
      path === '/login' ||
      path === '/register' ||
      path === '/logout' ||
      path.startsWith('/verify-email')) {
    return;
  }

  // ── Navigation requests (opening the app) ─────────────────
  // Handle separately: use ignoreSearch so query params added by
  // Android (e.g. ?source=pwa) don't prevent a cache hit.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/', { ignoreSearch: true }).then(function(cached) {
        // Refresh cache in background regardless
        fetch('/').then(function(resp) {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) { cache.put('/', resp); });
          }
        }).catch(function() {});

        if (cached) return cached;

        // Not cached yet — try network
        return fetch(event.request).then(function(resp) {
          if (resp && resp.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) { cache.put('/', resp.clone()); });
          }
          return resp;
        }).catch(function() {
          // Fully offline, nothing cached — show minimal offline page
          // so the SW always responds (never lets Chrome show its own error)
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

  // ── Static assets: stale-while-revalidate ─────────────────
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

// Cache URLs on demand (called from app.js when online)
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

// Open / focus the app when a notification is tapped
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
          if ('focus' in clientList[i]) return clientList[i].focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow('/');
      })
  );
});

// Handle server push payloads
self.addEventListener('push', function(event) {
  var data  = event.data ? event.data.json() : {};
  var title = data.title || 'SmartExpense';
  var opts  = {
    body:    data.body  || '',
    icon:    '/static/icons/icon-192.png',
    badge:   '/static/icons/icon-192.png',
    tag:     data.tag   || 'smartexpense',
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});
