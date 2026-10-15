const CACHE_NAME = 'fnl-cache-v4';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      // Delete all old caches, including old 'fnl-branding' and previous versions
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin non-GET requests or browser extensions
  if (event.request.method !== 'GET') return;

  // 1. Handle manifest.json - always return the dedicated padded PWA icons
  if (url.pathname === '/manifest.json') {
    event.respondWith(
      (async () => {
        const manifest = {
          "id": "/",
          "name": "Fresh N Local Co.",
          "short_name": "Fresh N Local",
          "description": "Pure Biotic Farm Fresh Produce - Growing Food For Souls",
          "start_url": "/",
          "scope": "/",
          "display": "standalone",
          "background_color": "#ffffff",
          "theme_color": "#15803d",
          "icons": [
            {
              "src": "/icon-192.png?v=2",
              "type": "image/png",
              "sizes": "192x192",
              "purpose": "any"
            },
            {
              "src": "/icon-512.png?v=2",
              "type": "image/png",
              "sizes": "512x512",
              "purpose": "any"
            },
            {
              "src": "/icon-512.png?v=2",
              "type": "image/png",
              "sizes": "512x512",
              "purpose": "maskable"
            },
            {
              "src": "/icon.png?v=2",
              "type": "image/png",
              "sizes": "512x512",
              "purpose": "any"
            },
            {
              "src": "/apple-touch-icon.png?v=2",
              "type": "image/png",
              "sizes": "180x180",
              "purpose": "any"
            },
            {
              "src": "/favicon.ico?v=2",
              "sizes": "64x64 32x32 24x24 16x16",
              "type": "image/x-icon"
            }
          ]
        };

        return new Response(JSON.stringify(manifest), {
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*'
          }
        });
      })()
    );
    return;
  }

  // 2. Handle app icons - network-first / fresh fetch so updates are never stuck in stale cache
  if (url.pathname.match(/^\/(icon-192\.png|icon-512\.png|apple-touch-icon\.png|icon\.png|favicon\.ico|favicon\.svg)$/)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Handle Product Images & Static Assets (Cache-First with Network Fallback)
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|css|js|ico)$/) || url.hostname.includes('firebasestorage.googleapis.com')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          // Fetch in background to update cache
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
          }).catch(() => {});
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return new Response('Offline asset not available', { status: 404, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // 4. Handle SPA Page Navigation (Network First, fallback to cached index.html for offline support)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(event.request) || await cache.match('/');
          if (cachedResponse) {
            return cachedResponse;
          }
          const indexCache = await cache.match('/index.html');
          if (indexCache) return indexCache;
          return new Response('App is offline. Please check your internet connection.', {
            status: 503,
            headers: { 'Content-Type': 'text/html' }
          });
        }
      })()
    );
    return;
  }

  // 5. Default fetch fallback
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
