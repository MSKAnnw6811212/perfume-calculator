/* Service Worker */ 
const CACHE_PREFIX='pcalc-cache-v1';
const CORE=['./','./index.html','./styles.css','./app.js','./manifest.json','./version.json','./data/ingredients.json','./data/ifra.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_PREFIX).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_PREFIX).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin===location.origin){if(u.pathname.endsWith('/version.json')||u.pathname.includes('/data/')){e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE_PREFIX).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));return}e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const cl=r.clone();caches.open(CACHE_PREFIX).then(x=>x.put(e.request,cl));return r}).catch(()=>caches.match('./index.html'))))}});
