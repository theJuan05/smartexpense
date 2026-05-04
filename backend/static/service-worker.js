const CACHE_NAME = 'smartexpense-v22';
const STATIC_ASSETS = [
  '/',
  '/frontend/index.html',
  '/frontend/css/style.css',
  '/frontend/js/db.js',
  '/frontend/js/api.js',
  '/frontend/js/charts.js',
  '/frontend/js/budget.js',
  '/frontend/js/predict.js',
  '/frontend/js/anomaly.js',
  '/frontend/js/advice.js',
  '/frontend/js/app.js',
  '/frontend/manifest.json'
];

self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
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
        keys.filter(function(key) {
          return key !== CACHE_NAME;
        }).map(function(key) {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  if (url.includes('/api/') ||
      url.includes('cdnjs.cloudflare.com') ||
      url.includes('generativelanguage.googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, response);
            });
          }
        }).catch(function() {});
        return cached;
      }

      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, copy);
        });
        return response;
      }).catch(function() {
        if (event.request.destination === 'document') {
          return caches.match('/frontend/index.html');
        }
      });
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
          var c = clientList[i];
          if ('focus' in c) return c.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow('/');
      })
  );
});

// Handle future server-push payloads
self.addEventListener('push', function(event) {
  var data  = event.data ? event.data.json() : {};
  var title = data.title || 'SmartExpense';
  var opts  = {
    body:  data.body  || '',
    icon:  '/static/icons/logo-icon.svg',
    badge: '/static/icons/logo-icon.svg',
    tag:   data.tag   || 'smartexpense',
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});