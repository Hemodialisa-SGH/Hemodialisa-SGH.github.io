/* Unit Hemodialisis RS Sedayu General Hospital — service worker
   Naikkan VER setiap kali isi situs berubah, dan samakan angkanya dengan
   ?v= pada tautan style.css dan app.js di index.html. */
const VER = 48;
const CACHE = 'hd-rssgh-v' + VER;
const ASET = [
  './',
  './index.html',
  `./assets/css/style.css?v=${VER}`,
  `./assets/js/app.js?v=${VER}`,
  `./assets/js/en.js?v=${VER}`,
  './assets/img/logo.png',
  './assets/img/unit-hd.jpg?v=48',
  './assets/img/favicon-32.png?v=48',
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

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;   // API jadwal, Sheets, dan font: langsung ke jaringan

  // Gaya, skrip, dan halaman: utamakan jaringan agar perubahan langsung terlihat,
  // lalu simpan salinannya untuk dipakai saat jaringan mati.
  const utamakanJaringan = e.request.mode === 'navigate'
    || /\.(css|js)$/.test(url.pathname);

  if (utamakanJaringan) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const salinan = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, salinan));
        }
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // Gambar dan berkas lain: cache dulu, karena jarang berubah.
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const salinan = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, salinan));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
