self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[ServiceWorker] Activated');
});

self.addEventListener('fetch', (e) => {
  // Required to pass PWA criteria
});
