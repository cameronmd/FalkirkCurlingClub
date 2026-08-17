/* Service worker — offline app shell for Falkirk Curling Club fixtures.
 * Cache-first for the app's own files so it opens with no connection.
 * Bump CACHE when any shell file changes to invalidate the old cache.
 */
var CACHE = 'fcc-v5';

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

  // Stale-while-revalidate: serve the cached copy immediately (instant + works
  // offline), but always fetch a fresh copy in the background so the next load
  // is up to date. This avoids users getting stuck on a stale cached app.
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
          return res;
        }).catch(function () {
          // Offline and not cached → fall back to the app shell for navigations.
          return cached || (req.mode === 'navigate' ? cache.match('index.html') : undefined);
        });
        return cached || network;
      });
    })
  );
});
