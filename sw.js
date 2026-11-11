/* Service worker: lưu sẵn giao diện để mở nhanh. KHÔNG lưu dữ liệu API (mọi yêu cầu API là POST, đi thẳng ra mạng).
 * Tệp giao diện: dùng ngay bản đã lưu, đồng thời tải bản mới ở nền. Khi phát hành bản mới, VERSION đổi → toàn bộ tệp được tải lại. */
const VERSION = 'gts-v1.5.4';
const SHELL = ['./', 'index.html', 'config.js', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/api.js', 'js/ui.js', 'js/image.js', 'js/queue.js', 'js/charts.js', 'js/thumbs.js',
  'js/tabs/overview.js', 'js/tabs/record.js', 'js/tabs/logbook.js', 'js/tabs/checks.js', 'js/tabs/duty.js', 'js/tabs/review.js', 'js/tabs/scores.js', 'js/tabs/ranking.js',
  'js/tabs/profiles.js', 'js/tabs/stats.js', 'js/tabs/notices.js', 'js/tabs/export.js', 'js/tabs/admin.js',
  'js/xlsx/engine.js', 'js/xlsx/collage.js', 'js/xlsx/report.js'];

self.addEventListener('install', e => {
  // cache: 'reload' để không lấy nhầm bản cũ trong bộ nhớ đệm HTTP của trình duyệt
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
      if (hit) { net.catch(() => {}); return hit; }
      return net.catch(() => caches.match('index.html'));
    }));
  } else if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
  }
});
