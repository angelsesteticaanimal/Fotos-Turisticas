const CACHE='foto-turismo-v322-completo';
const ASSETS=[
  './','./index.html','./styles.css?v=322','./app.js?v=322','./manifest.json',
  './icons/icon-192.png','./icons/icon-512.png',
  './praia-do-forte-3d-bg.png','./praia-do-forte-3d-suave-front.png','./praia-do-forte-3d-bold-front.png',
  './praia-do-forte-3d-suave-thumb.png','./praia-do-forte-3d-bold-thumb.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE&&caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
