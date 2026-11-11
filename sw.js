// Pondo — Fund Tracker service worker
// Provides an offline-first app shell cache. All user data lives in IndexedDB
// (handled by the app itself) — this worker only caches static assets.
//
// Note: a prior push to main hit a transient "Deployment failed, try again
// later" error from GitHub Pages' deploy step (the build itself succeeded).
// This comment-only change exists solely to produce a new commit so Pages
// retries the deploy from scratch.

const CACHE_VERSION = 'pondo-v55';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.ico',
  './icons/favicon-16x16.png',
  './icons/favicon-32x32.png',
  './icons/favicon-48x48.png',
  './icons/apple-touch-icon.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-256.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './assets/branding/login-bg.jpg',
  './assets/branding/login-bg-dark.jpg',
  './assets/branding/login-portrait.jpg',
  './assets/branding/login-landscape.jpg',
  './assets/branding/share-banner.jpg',
  './functions/projection.js',
];

// Firebase Auth SDK (loaded from the CDN) is cached at runtime too, see the
// fetch handler below, so a previously cached SDK can initialize offline.
// Google sign-in itself requires an internet connection.
const RUNTIME_CACHEABLE_ORIGINS = ['https://www.gstatic.com'];

// Best-effort precache of the pinned Firebase SDK modules the app imports on
// every load (see the module script in index.html). These are cached
// opportunistically anyway on first successful fetch (fetch handler below),
// but precaching them here too means a browser that installs this app over
// a flaky connection -- then goes offline before ever completing a load
// that happens to fetch all three -- still has them. Fetched with
// Promise.allSettled rather than cache.addAll() so one failing request
// (e.g. offline during install) can't abort the app-shell install itself.
const FIREBASE_SDK_URLS = [
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL).then(() => cache))
      .then((cache) => Promise.allSettled(
        FIREBASE_SDK_URLS.map((url) =>
          fetch(url, { mode: 'cors' }).then((response) => {
            if (response && response.status === 200) return cache.put(url, response);
          }).catch(() => {})
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first for navigation requests (so updates are picked up quickly),
// falling back to the cached app shell when offline.
// Cache-first for static assets (icons, fonts) for speed.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isRuntimeCacheable = RUNTIME_CACHEABLE_ORIGINS.includes(url.origin);

  if (request.mode === 'navigate') {
    // Never cache an embedded report (or any other page) as the main app.
    const appRoot = new URL('./', self.location.href).pathname;
    const appIndex = new URL('./index.html', self.location.href).pathname;
    if (!isSameOrigin || (url.pathname !== appRoot && url.pathname !== appIndex)) {
      event.respondWith(fetch(request).catch(() => caches.match(request)));
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (isSameOrigin || isRuntimeCacheable) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request, isRuntimeCacheable ? { mode: 'cors' } : undefined).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});
