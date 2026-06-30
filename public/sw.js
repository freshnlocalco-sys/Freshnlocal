self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname === '/manifest.json') {
    event.respondWith(
      (async () => {
        let iconUrl = url.searchParams.get('icon');
        
        try {
          // Open the branding cache
          const cache = await caches.open('fnl-branding');
          
          if (iconUrl) {
            // Store the latest icon URL in cache for offline or fallback fetches
            await cache.put('/branding-icon-url', new Response(iconUrl));
            // Pre-fetch and cache the actual image response for offline use!
            try {
              const imgResponse = await fetch(iconUrl);
              if (imgResponse.ok) {
                await cache.put('/branding-icon-image', imgResponse);
              }
            } catch (imgErr) {}
          } else {
            // If no icon in query string, try to read from cached response
            const cachedResponse = await cache.match('/branding-icon-url');
            if (cachedResponse) {
              iconUrl = await cachedResponse.text();
            }
          }
        } catch (e) {
          console.warn("Service worker cache error:", e);
        }
        
        if (iconUrl) {
          const mimeType = iconUrl.endsWith('.svg') ? 'image/svg+xml' : (iconUrl.endsWith('.png') ? 'image/png' : 'image/jpeg');
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
                "type": mimeType,
                "sizes": "192x192",
                "purpose": "any"
              },
              {
                "src": "/icon-512.svg",
                "type": mimeType,
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
        }
        
        // Fallback to static manifest if no custom icon is available
        return fetch(event.request);
      })()
    );
  }

  // Intercept the static icons and favicon requests to serve the cached branding image
  if (url.pathname === '/icon-192.svg' || url.pathname === '/icon-512.svg' || url.pathname === '/favicon.ico') {
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open('fnl-branding');
          
          // 1. Check if we have the cached image response directly
          const cachedImgResponse = await cache.match('/branding-icon-image');
          if (cachedImgResponse) {
            return cachedImgResponse.clone();
          }
          
          // 2. Fallback: fetch using the cached URL
          const cachedUrlResponse = await cache.match('/branding-icon-url');
          if (cachedUrlResponse) {
            const iconUrl = await cachedUrlResponse.text();
            if (iconUrl) {
              const response = await fetch(iconUrl);
              if (response.ok) {
                // Cache it for subsequent offline requests
                await cache.put('/branding-icon-image', response.clone());
                return response;
              }
            }
          }
        } catch (e) {
          console.warn("Service worker failed to serve custom icon, using original:", e);
        }
        
        // Fallback to actual network request for the static file
        return fetch(event.request);
      })()
    );
  }
});
