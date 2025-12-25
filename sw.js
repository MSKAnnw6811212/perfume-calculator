/* Service Worker: Robust Version 6 | Fixes: Error safety, Logo caching */

const CACHE = 'pcalc-cache-v6';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './version.json',
  './Pixel & Pour Logo.png',
  './data/ingredients.json',
  './data/ifra.json',
  './data/ifra-51.json',
  './data/synonyms.json',
  './data/regulatory.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Scope: Only handle same-origin requests (ignore Google Fonts/Analytics for now)
  if (url.origin !== location.origin) return;

  // 2. Strategy: Network First (for Data & Version)
  // We want the latest ingredients immediately. If offline, use cache.
  if (url.pathname.endsWith('/version.json') || url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(req)
        .then(r => {
          // Safety: Only cache valid 200 OK responses
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return r;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3. Strategy: Cache First (for App Shell: HTML, CSS, JS, Images)
  // Load fast from cache. If missing, go to network.
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      
      return fetch(req)
        .then(r => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return r;
        })
        .catch(() => {
          // Fallback: If navigating to a page and offline, show index.html
          if (req.mode === 'navigate') return caches.match('./index.html');
          // Otherwise, return a generic error
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
    })
  );
});
