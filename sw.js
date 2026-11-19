// يخلي التطبيق يفتح بسرعة وحتى لو النت ضعيف (البيانات نفسها بتيجي من النت)
const CACHE = 'mawredin-v19';
const SHELL = ['./', './index.html', './css/app.css', './js/core.js', './js/suppliers.js', './js/reports.js', './js/home.js', './js/employees.js', './js/app.js', './config.js', './vendor/supabase.js', './manifest.json', './icons/icon-192.png', './icons/apple-touch-icon.png', './icons/ward.png', './icons/zahra.png', './icons/3d/suppliers.webp', './icons/3d/checks.webp', './icons/3d/employees.webp', './icons/3d/reports.webp', './icons/3d/loans.webp', './icons/3d/cash.webp', './icons/3d/banks.webp', './icons/3d/expenses.webp'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.endsWith('supabase.co')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && (u.origin === location.origin || u.hostname.includes('jsdelivr') || u.hostname.includes('fonts.g'))) {
        const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
