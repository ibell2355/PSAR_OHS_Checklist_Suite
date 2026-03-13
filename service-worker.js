/*
 * Service Worker — PSAR OHS Checklist Suite
 *
 * Strategy:
 *   HTML navigation    → network-first (fall back to cached index.html for SPA)
 *   Same-origin assets → network-first (fall back to cache when offline)
 *   Cross-origin       → network only
 *
 * Bump CACHE_NAME when you add/remove files from APP_SHELL or want to
 * force-purge the entire cache.
 */

const CACHE_NAME = 'psar-ohs-v1';

const APP_SHELL = [
  './',
  './index.html',
  './src/main.js',
  './src/ui/render.js',
  './src/ui/styles.css',
  './src/model/configLoader.js',
  './src/storage/db.js',
  './src/utils/simpleYaml.js',
  './src/pdf/pdfWriter.js',
  './src/pdf/vehicleReport.js',
  './config/vehicle_safety_check.yaml',
  './package.json',
  './manifest.webmanifest',
  './assets/psar_logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

/* ---- Install: pre-cache app shell ---- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

/* ---- Activate: purge old caches ---- */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ---- Fetch ---- */

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isNav = event.request.mode === 'navigate' || event.request.destination === 'document';
  const isSameOrigin = url.origin === self.location.origin;

  // HTML navigation: network-first, cache fallback
  if (isNav) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          caches.open(CACHE_NAME).then((c) => c.put(event.request, resp.clone()));
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Same-origin static assets: network-first, cache fallback
  if (isSameOrigin) {
    const cacheKey = new Request(url.pathname);
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(cacheKey, resp.clone()));
          }
          return resp;
        })
        .catch(() => caches.open(CACHE_NAME).then((c) => c.match(cacheKey)))
    );
    return;
  }

  // Cross-origin: network only
  event.respondWith(fetch(event.request));
});
