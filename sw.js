// التطبيق نفسه (الملفات) متخزن على الجهاز: بيفتح على طول حتى من غير نت.
// بنعرض النسخة المتخزنة فورًا من غير نت؛ ولما يترفع إصدار جديد، الملف ده بيتغير
// فالمتصفح بينزّل النسخة الجديدة كلها مرة واحدة والتطبيق بيعيد فتح نفسه عليها.
const CACHE = 'mawredin-v97';
const SHELL = ['./', './index.html', './css/app.css', './js/core.js', './js/store.js', './js/suppliers.js', './js/reports.js', './js/statement.js', './js/checks.js', './js/home.js', './js/employees.js', './js/protect.js', './js/app.js', './js/details.js', './js/loans.js', './js/cash.js', './js/expenses.js', './js/banks.js', './js/empaccount.js',
  './config.js', './vendor/supabase.js', './manifest.json', './icons/icon-192.png', './icons/apple-touch-icon.png', './icons/ward.png', './icons/zahra.png',
  './icons/3d/suppliers.webp', './icons/3d/checks.webp', './icons/3d/employees.webp', './icons/3d/reports.webp', './icons/3d/loans.webp', './icons/3d/cash.webp', './icons/3d/banks.webp', './icons/3d/expenses.webp',
  './vendor/fonts/cairo-arabic-400-normal.woff2', './vendor/fonts/cairo-arabic-600-normal.woff2', './vendor/fonts/cairo-arabic-700-normal.woff2', './vendor/fonts/cairo-arabic-800-normal.woff2',
  './vendor/fonts/cairo-latin-400-normal.woff2', './vendor/fonts/cairo-latin-600-normal.woff2', './vendor/fonts/cairo-latin-700-normal.woff2', './vendor/fonts/cairo-latin-800-normal.woff2',
  './vendor/pdf/pdfkit.standalone.js', './vendor/pdf/cairo-regular.ttf', './vendor/pdf/cairo-bold.ttf', './vendor/pdf/pdf.min.js', './vendor/pdf/pdf.worker.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, {cache:'reload'})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;                // البيانات (Supabase) مش بتتخزن هنا
  if (/\/(rest|auth|storage)\/v1\/|\/local-info/.test(u.pathname)) return;            // السيرفر المحلي
  const isPage = e.request.mode === 'navigate';
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(isPage ? './index.html' : e.request, {ignoreSearch: isPage});
    if (hit) return hit;                                              // من الجهاز فورًا (الإصدار الجديد بييجي مع تغيير الملف ده)
    return fetch(e.request).then(r => { if (r.ok && !isPage) c.put(e.request, r.clone()); return r; })
      .catch(() => c.match('./index.html'));
  }));
});
