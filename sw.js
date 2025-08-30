const CACHE='pcalc-cache-v2';
const CORE=['./','./index.html','./styles.css','./app.js','./manifest.json','./version.json','./data/ingredients.json','./data/ifra.json','./data/ifra-51.json','./data/synonyms.json','./data/regulatory.json','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim()});
self.addEventListener('message',e=>{if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin===location.origin){
    if(u.pathname.endsWith('/version.json') || u.pathname.includes('/data/')){
      e.respondWith(fetch(e.request).then(r=>{const cl=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cl)); return r}).catch(()=>caches.match(e.request)));
      return;
    }
    e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const cl=r.clone(); caches.open(CACHE).then(cache=>cache.put(e.request,cl)); return r}).catch(()=>caches.match(e.request))));
  }
});
