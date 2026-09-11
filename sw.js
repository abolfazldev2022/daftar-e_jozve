// sw.js — caches the app shell ONLY. User data lives in IndexedDB (see js/db.js)
// and is never touched here. Bump CACHE_VERSION on every deploy that changes
// any cached file, so the activate step cleans up the old cache correctly.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `daftar-jozve-shell-${CACHE_VERSION}`;

const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/themes.css',
  './css/responsive.css',
  './js/app.js',
  './js/db.js',
  './js/courses.js',
  './js/sessions.js',
  './js/notes.js',
  './js/editor.js',
  './js/recorder.js',
  './js/attachments.js',
  './js/backup.js',
  './js/search.js',
  './js/storage.js',
  './js/theme.js',
  './js/ui.js',
  './js/utils.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('daftar-jozve-shell-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache-first strategy for the app shell: instant offline load. Falls back to
// network for anything not pre-cached (and re-caches it opportunistically),
// so the app still works if a file was missed, as long as the network is up
// at least once.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached — for navigations, fall back to the app shell
          // so the SPA router can still render (e.g. a deep link opened offline).
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 504, statusText: 'آفلاین و در حافظهٔ محلی موجود نیست' });
        });
    })
  );
});

// Lets the page trigger activation of a waiting new version on demand
// (see the "update available" banner in app.js).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
