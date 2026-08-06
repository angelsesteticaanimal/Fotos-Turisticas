const CACHE='foto-turismo-v32';
const ASSETS=[
  './','./index.html','./styles.css','./app.js','./manifest.json',
  './praia-do-forte-3d-bg.png','./praia-do-forte-3d-suave-front.png','./praia-do-forte-3d-bold-front.png',
  './praia-do-forte-3d-suave-thumb.png','./praia-do-forte-3d-bold-thumb.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE&&caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
