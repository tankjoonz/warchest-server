// Minimal service worker — this game needs a live server connection to play,
// so we deliberately don't cache gameplay for offline use. This file exists
// mainly to satisfy Android's installability checks for "Add to Home Screen".
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // pass-through, no caching
