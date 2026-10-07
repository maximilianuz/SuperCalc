// Service worker: precachea todo para que la app funcione sin internet.
// Dentro del APK (Capacitor) no se registra.
const VERSION = 'compras-v7';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'fonts/Geist-Variable.woff2',
  'js/app.js',
  'js/money.js',
  'js/storage.js',
  'js/list.js',
  'js/history.js',
  'js/priceparser.js',
  'js/ean.js',
  'js/imageutil.js',
  'js/ocr.js',
  'js/barcode.js',
  'js/camera.js',
  'js/ledger.js',
  'js/budget.js',
  'ocr/tesseract.min.js',
  'ocr/worker.min.js',
  'ocr/tesseract-core-simd-lstm.wasm.js',
  'ocr/tesseract-core-lstm.wasm.js',
  'ocr/spa.traineddata.gz',
  'vendor/zxing.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    })(),
  );
});
