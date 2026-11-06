/* Сеть в приоритете: посетитель всегда видит свежую версию, а без интернета открывается сохранённая. */
var CACHE = 'solnce-invest-v1';
var ASSETS = [
  './', 'index.html', 'styles.css', 'calc.js', 'app.js', 'manrope.woff2', 'mark.png',
  'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png',
  'icon-maskable-512.png', 'manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res.ok && res.type === 'basic') {
          var copy = res.clone();
          var key = req.mode === 'navigate' ? 'index.html' : req;
          caches.open(CACHE).then(function (cache) { cache.put(key, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true });
      })
  );
});
