// Guarda el Cuartel en el móvil para que abra sin internet.
// Sube el número de VERSION cada vez que publiques cambios.
const VERSION = 'cuartel-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', '../img/icon-192.png', '../img/icon-512.png', '../img/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Solo borra las cachés viejas del Cuartel, nunca las de Wild Pass
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('cuartel-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // fuentes de Google: en directo
  // Primero la red (última versión); sin conexión, lo guardado.
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
