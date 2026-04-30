const CACHE_NAME = 'smartexpense-v2';
const STATIC_ASSETS = [
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

// Install — cache all static files
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

// Activate — clean old caches
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

// Fetch strategy:
// API calls — network only (never cache)
// Static files — cache first, network fallback
self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  // Skip API calls — always go to network
  if (url.includes('127.0.0.1:5000') ||
      url.includes('localhost:5000') ||
      url.includes('cdnjs.cloudflare.com')) {
    return;
  }

  // Static files — cache first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Return cached version
        // Also update cache in background
        fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, response);
            });
          }
        }).catch(function() {});
        return cached;
      }

      // Not in cache — fetch from network
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
        // Offline fallback for HTML pages
        if (event.request.destination === 'document') {
          return caches.match('/frontend/index.html');
        }
      });
    })
  );
});

// Background sync
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-expenses') {
    console.log('[SW] Background sync triggered');
  }
});