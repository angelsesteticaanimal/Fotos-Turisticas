const CACHE='foto-turismo-v241-root-images';
const ASSETS=['./','./index.html','./styles.css?v=241','./app.js?v=241','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./praia-do-forte-3d-bg.png','./praia-do-forte-3d-suave-front.png','./praia-do-forte-3d-bold-front.png','./praia-do-forte-3d-suave-thumb.png','./praia-do-forte-3d-bold-thumb.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE&&caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).then(r=>{const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));return r;}).catch(()=>caches.match(e.request))));
