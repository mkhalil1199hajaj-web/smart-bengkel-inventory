/* Service worker Smart Bengkel Inventory.
 * - Kulit aplikasi (HTML, pustaka, fon, ikon) disimpan dalam cache supaya app dibuka pantas.
 * - Panggilan API ke Apps Script TIDAK disimpan dalam cache: data stok sentiasa terkini dari server.
 * Naikkan VERSI setiap kali index.html atau fail dalam vendor/ berubah. */
const VERSI = 'sbi-v1';
const KULIT = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/lucide.min.js',
  './vendor/chart.umd.js',
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/fonts/poppins-latin-400-normal.woff2',
  './vendor/fonts/poppins-latin-500-normal.woff2',
  './vendor/fonts/poppins-latin-600-normal.woff2',
  './vendor/fonts/poppins-latin-700-normal.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(KULIT)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // POST ke API: terus ke rangkaian
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // Apps Script & lain-lain: tidak disentuh

  // Halaman: cuba rangkaian dahulu (dapat versi terbaru), guna cache bila offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSI).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Aset statik: cache dahulu, kemas kini di belakang.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSI).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
