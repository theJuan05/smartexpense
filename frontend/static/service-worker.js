// Minimal service worker — satisfies PWA install requirement.
// No caching logic. App works online; Firebase handles push notifications.

self.addEventListener('install',  function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch',    function() { /* pass-through, no caching */ });
