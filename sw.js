/* BTX Agenda Premium — Service Worker (cache básico)
   Observação: bibliotecas CDN (jsPDF) são cacheadas como "opaque" após 1º uso online.
*/
const CACHE = "btx-premium-v6_1";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./idb.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k===CACHE)?null:caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Network-first para chamadas externas; cache-first para mesmo-origin
  if (url.origin === location.origin) {
    event.respondWith((async ()=>{
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // externo: tenta rede, cai no cache
  event.respondWith((async ()=>{
    try{
      const res = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
      return res;
    }catch(e){
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      return new Response("Offline", {status: 503, headers: {"Content-Type":"text/plain"}});
    }
  })());
});
