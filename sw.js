'use strict';

// ─── Cache Names ────────────────────────────────────────────────────────────
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `chord-library-static-${CACHE_VERSION}`;
const CDN_CACHE    = `chord-library-cdn-${CACHE_VERSION}`;

// ─── Static Assets to Pre-cache ─────────────────────────────────────────────
// The HTML references JS/CSS with a ?v= query string; cache both forms so the
// app shell is available regardless of how the browser requests the file.
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/style.css?v=1.0.2',
  './js/app.js',
  './js/app.js?v=1.0.2',
  './js/firebase-config.js',
  './js/firebase-config.js?v=1.0.2',
  './js/sync-service.js',
  './js/sync-service.js?v=1.0.2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Firebase CDN scripts – cached at runtime on first load.
const CDN_ORIGIN = 'https://www.gstatic.com';

// Firebase back-end hostnames whose requests must always go to the network
// (authentication tokens, Firestore reads/writes, etc.).
const NETWORK_ONLY_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'accounts.google.com',
  'oauth2.googleapis.com',
  'firebaseinstallations.googleapis.com',
];

// ─── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: remove stale caches & notify clients ──────────────────────────
self.addEventListener('activate', event => {
  const currentCaches = new Set([STATIC_CACHE, CDN_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => !currentCaches.has(key))
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients that a new version is active
        return self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED' });
          });
        });
      })
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Firebase / Google API calls → always network-only
  if (NETWORK_ONLY_HOSTS.some(host => url.hostname.includes(host))) {
    return; // let the browser handle it normally
  }

  // 2. Firebase CDN scripts (www.gstatic.com) → cache-first, update in background
  if (url.origin === CDN_ORIGIN) {
    event.respondWith(staleWhileRevalidate(request, CDN_CACHE));
    return;
  }

  // 3. Same-origin assets → cache-first with network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

// ─── Caching Strategies ──────────────────────────────────────────────────────

/**
 * Cache-first: return cached response immediately; fall back to network and
 * store the result for next time.
 */
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(cache =>
    cache.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => {
          // If the network fails and there's no cached entry, try matching
          // without the query string (handles ?v= versioning mismatches).
          return cache.match(request, { ignoreSearch: true });
        });
    })
  );
}

/**
 * Stale-while-revalidate: return cache immediately (if available) and update
 * the cache in the background.  Falls back to network when nothing is cached.
 */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(cache =>
    cache.match(request).then(cached => {
      const networkFetch = fetch(request)
        .then(response => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
}
