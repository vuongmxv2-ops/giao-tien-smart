/* Service worker: lưu sẵn giao diện để mở nhanh khi mạng yếu. KHÔNG lưu dữ liệu API (mọi yêu cầu API là POST, đi thẳng ra mạng). */
const VERSION = 'gts-v1.0.0';
const SHELL = ['./', 'index.html', 'config.js', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/api.js', 'js/ui.js', 'js/image.js', 'js/queue.js', 'js/charts.js',
  'js/tabs/overview.js', 'js/tabs/record.js', 'js/tabs/checks.js', 'js/tabs/duty.js', 'js/tabs/review.js', 'js/tabs/scores.js', 'js/tabs/ranking.js',
  'js/tabs/profiles.js', 'js/tabs/stats.js', 'js/tabs/notices.js', 'js/tabs/export.js', 'js/tabs/admin.js',
  'js/xlsx/engine.js', 'js/xlsx/collage.js', 'js/xlsx/report.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // Mạng trước, bộ nhớ đệm khi mất mạng
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; }).catch(() => caches.match(req)));
  } else if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
  }
});
