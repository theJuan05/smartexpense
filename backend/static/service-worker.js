const CACHE_NAME = 'smartexpense-v27';
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
  '/static/js/app.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/logo-icon.svg',
];

self.addEventListener('install', function(event) {
  console.log('[SW] Installing v27...');
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
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  const url  = event.request.url;
  const path = new URL(url).pathname;

  // Never cache: API calls, auth routes, CDNs, AI endpoints
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

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      const networkFetch = fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, response.clone());
          });
        }
        return response;
      }).catch(function() {});

      return cached || networkFetch || caches.match('/');
    })
  );
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
