/* Service worker — offline app shell for Falkirk Curling Club fixtures.
 * Cache-first for the app's own files so it opens with no connection.
 * Bump CACHE when any shell file changes to invalidate the old cache.
 */
var CACHE = 'fcc-v3';

// All same-origin files that make up the app shell. Relative paths so this
// works both at the domain root and under /FalkirkCurlingClub/ on Pages.
var SHELL = [
  '.',
  'index.html',
  'styles.css',
  'parser.js',
  'fixtures.js',
  'calendar.js',
  'share.js',
  'app.js',
  'vendor/xlsx.full.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  // Only handle same-origin requests; let anything else hit the network.
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        // Runtime-cache successful same-origin GETs (e.g. first-seen assets).
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // Offline navigation fallback → the app shell.
        if (req.mode === 'navigate') return caches.match('index.html');
      });
    })
  );
});
