const CACHE_NAME = 'fnl-cache-v2';
const BRANDING_CACHE = 'fnl-branding';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== BRANDING_CACHE).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin non-GET requests or browser extensions
  if (event.request.method !== 'GET') return;

  // 1. Handle dynamic manifest.json with custom icon support
  if (url.pathname === '/manifest.json') {
    event.respondWith(
      (async () => {
        let iconUrl = url.searchParams.get('icon');
        try {
          const cache = await caches.open(BRANDING_CACHE);
          if (iconUrl) {
            await cache.put('/branding-icon-url', new Response(iconUrl));
            try {
              const imgResponse = await fetch(iconUrl);
              if (imgResponse.ok) {
                await cache.put('/branding-icon-image', imgResponse);
              }
            } catch (imgErr) {}
          } else {
            const cachedResponse = await cache.match('/branding-icon-url');
            if (cachedResponse) {
              iconUrl = await cachedResponse.text();
            }
          }
        } catch (e) {
          console.warn("Service worker cache error:", e);
        }

        const mimeType = iconUrl && iconUrl.endsWith('.svg') ? 'image/svg+xml' : (iconUrl && iconUrl.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const manifest = {
          "name": "Fresh N Local",
          "short_name": "FNL",
          "description": "Fresh N Local - Local delivery app",
          "start_url": "/",
          "display": "standalone",
          "background_color": "#ffffff",
          "theme_color": "#2c3e30",
          "icons": [
            {
              "src": "/favicon.ico",
              "type": "image/x-icon",
              "sizes": "64x64 32x32 24x24 16x16",
              "purpose": "any"
            },
            {
              "src": "/icon-192.svg",
              "type": mimeType || "image/svg+xml",
              "sizes": "192x192",
              "purpose": "any"
            },
            {
              "src": "/icon-512.svg",
              "type": mimeType || "image/svg+xml",
              "sizes": "512x512",
              "purpose": "any"
            }
          ]
        };

        return new Response(JSON.stringify(manifest), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      })()
    );
    return;
  }

  // 2. Handle branding icons & favicon
  if (url.pathname === '/icon-192.svg' || url.pathname === '/icon-512.svg' || url.pathname === '/favicon.ico') {
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(BRANDING_CACHE);
          const cachedImgResponse = await cache.match('/branding-icon-image');
          if (cachedImgResponse) {
            return cachedImgResponse.clone();
          }
          const cachedUrlResponse = await cache.match('/branding-icon-url');
          if (cachedUrlResponse) {
            const iconUrl = await cachedUrlResponse.text();
            if (iconUrl) {
              const response = await fetch(iconUrl);
              if (response.ok) {
                await cache.put('/branding-icon-image', response.clone());
                return response;
              }
            }
          }
        } catch (e) {}
        return fetch(event.request);
      })()
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
          // If offline and not in cache, return fallback or fail gracefully
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
          // Ultimate fallback index.html if cached
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
