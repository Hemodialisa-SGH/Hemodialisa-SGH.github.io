const CACHE = 'hd-rssgh-v7';
const ASET = [
  './',
  './index.html',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/img/logo.png',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASET)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Halaman statis: cache dulu. Permintaan ke domain lain (API jadwal) tidak pernah di-cache.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;   // API jadwal, Sheets, dan font: langsung ke jaringan
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && url.origin === self.location.origin) {
        const salinan = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, salinan));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
