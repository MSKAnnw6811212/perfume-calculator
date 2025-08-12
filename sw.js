/* Service Worker for Perfume Calculator */
const CACHE_PREFIX = 'pcalc-cache-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './version.json',
  './data/ingredients.json',
  './data/ifra.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_PREFIX).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_PREFIX).map(k => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Same-origin only
  if (url.origin === location.origin) {
    // Network-first for dynamic JSONs and version file
    if (url.pathname.endsWith('/version.json') || url.pathname.includes('/data/')) {
      event.respondWith(
        fetch(req).then(res => {
          const resClone = res.clone();
          caches.open(CACHE_PREFIX).then(cache => cache.put(req, resClone));
          return res;
        }).catch(() => caches.match(req))
      );
      return;
    }

    // Cache-first for app shell & static assets
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const resClone = res.clone();
        caches.open(CACHE_PREFIX).then(cache => cache.put(req, resClone));
        return res;
      }).catch(() => caches.match('./index.html')))
    );
  }
});
