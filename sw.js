// Pondo — Fund Tracker service worker
// Provides an offline-first app shell cache. All user data lives in IndexedDB
// (handled by the app itself) — this worker only caches static assets.
//
// Note: a prior push to main hit a transient "Deployment failed, try again
// later" error from GitHub Pages' deploy step (the build itself succeeded).
// This comment-only change exists solely to produce a new commit so Pages
// retries the deploy from scratch.

const CACHE_VERSION = 'pondo-v135';
// Cache Storage is shared by every app on this origin. Only prune our own versions.
const PONDO_CACHE_NAME = /^pondo-v\d+$/;
const APP_SHELL = [
  './',
  './index.html',
  './member-refund-service.mjs',
  './refund-items.js',
  './unified-ledger.js',
  './offline-sync.js',
  './team-draft-reconcile.mjs',
  './refund-receipt-sync.mjs',
  './manifest.webmanifest',
  './favicon.ico',
  './icons/rounded/favicon.ico',
  './icons/rounded/favicon-16x16.png',
  './icons/rounded/favicon-32x32.png',
  './icons/rounded/favicon-48x48.png',
  './icons/rounded/icon-72.png',
  './icons/rounded/icon-96.png',
  './icons/rounded/icon-128.png',
  './icons/rounded/icon-144.png',
  './icons/rounded/icon-152.png',
  './icons/rounded/icon-192.png',
  './icons/rounded/icon-256.png',
  './icons/rounded/icon-384.png',
  './icons/rounded/icon-512.png',
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
  './assets/notification-icons/due.png',
  './assets/notification-icons/overdue.png',
  './assets/notification-icons/refund.png',
  './assets/notification-icons/income.png',
  './assets/notification-icons/expense.png',
  './assets/notification-icons/donation.png',
  './assets/notification-icons/contribution.png',
  './assets/notification-icons/death-aid.png',
  './assets/notification-icons/backup.png',
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
  './organization-firestore.mjs',
  './workspace-approval.mjs',
  './workspace-membership-recovery.mjs',
  './faculty-fund-ui.js',
  './faculty-fund-notifications.js',
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
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js',
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
  );
});

// A waiting update is activated only when a client requests it. Other open
// windows must choose when to reload; do not force-refresh unsaved forms.
// Android browsers may reject new Notification in a page. The requesting
// open client is the only destination for a click; this is not push delivery.
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'PONDO_GET_CACHE_VERSION'){event.ports?.[0]?.postMessage({version:CACHE_VERSION});return;}
  if(event.data && event.data.type === 'PONDO_ACTIVATE_UPDATE'){event.waitUntil(self.skipWaiting());return;}
  const d=event.data,source=event.source;
  if(!d||d.type!=='PONDO_SHOW_NOTIFICATION'||!source||typeof source.id!=='string'||typeof source.url!=='string')return;
  let clientUrl,scope;try{clientUrl=new URL(source.url);scope=new URL(self.registration.scope);}catch(e){return;}
  if(clientUrl.origin!==scope.origin||![scope.pathname,scope.pathname+'index.html'].includes(clientUrl.pathname))return;
  if(typeof d.title!=='string'||!d.title||d.title.length>500||typeof d.body!=='string'||d.body.length>2000||typeof d.id!=='string'||d.id.length>500||typeof d.recipientUid!=='string'||!d.recipientUid||d.recipientUid.length>128)return;
  if(d.orgId!==null&&(typeof d.orgId!=='string'||d.orgId.length>150))return;
  if(d.approvalKey!==null&&(typeof d.approvalKey!=='string'||d.approvalKey.length>500))return;
  let icon;try{const u=new URL(d.icon,scope);const assetNames=['due','overdue','refund','income','expense','donation','contribution','death-aid','backup'];
    const local=u.origin===scope.origin&&([scope.pathname+'icons/icon-192.png',...assetNames.map(x=>scope.pathname+'assets/notification-icons/'+x+'.png')].includes(u.pathname))&&!u.search&&!u.hash;
    const google=u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)(googleusercontent\.com|ggpht\.com)$/i.test(u.hostname);
    if(!local&&!google)return;icon=u.href;
  }catch(e){return;}
  const data={type:'PONDO_NOTIFICATION_CLICK',clientId:source.id,id:d.id,recipientUid:d.recipientUid,orgId:d.orgId,approvalKey:d.approvalKey};
  event.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon,tag:d.id,data}).catch(()=>{}));
});
self.addEventListener('notificationclick', event => {
  const d=event.notification?.data;event.notification?.close();
  if(!d||d.type!=='PONDO_NOTIFICATION_CLICK'||typeof d.clientId!=='string')return;
  event.waitUntil(self.clients.get(d.clientId).then(async client=>{if(!client)return;try{await client.focus();}catch(e){}client.postMessage(d);}).catch(()=>{}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const obsolete = keys.filter((key) => PONDO_CACHE_NAME.test(key) && key !== CACHE_VERSION);
      if (obsolete.length) {
        // Best-effort marker for the About panel; never prevent activation if storage is unavailable.
        try { const cache = await caches.open(CACHE_VERSION); await cache.put('./.pondo-update-ready-v135', new Response('updated')); } catch (err) { console.warn('Could not record update marker:', err); }
      }
      await Promise.all(obsolete.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
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
  // Do not intercept or cache a sibling app's files on a shared origin.
  const appRoot = new URL('./', self.location.href).pathname;
  if (isSameOrigin && !url.pathname.startsWith(appRoot)) return;

  // Auth helper endpoints are dynamic, not offline app assets. If a future
  // host serves them same-origin, let the browser fetch them directly.
  if (isSameOrigin && (url.pathname === '/__/auth' || url.pathname.startsWith('/__/auth/'))) return;

  if (request.mode === 'navigate') {
    // Never cache an embedded report (or any other page) as the main app.
    const appIndex = new URL('./index.html', self.location.href).pathname;
    if (!isSameOrigin || (url.pathname !== appRoot && url.pathname !== appIndex)) {
      event.respondWith(fetch(request).catch(() => caches.open(CACHE_VERSION).then(cache => cache.match(request))));
      return;
    }
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.open(CACHE_VERSION).then(cache => cache.match('./index.html')))
    );
    return;
  }

  if (isSameOrigin || isRuntimeCacheable) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache => cache.match(request)).then((cached) => {
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
