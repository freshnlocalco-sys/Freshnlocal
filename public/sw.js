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
                "src": iconUrl,
                "type": mimeType,
                "sizes": "192x192",
                "purpose": "any"
              },
              {
                "src": iconUrl,
                "type": mimeType,
                "sizes": "512x512",
                "purpose": "any"
              },
              {
                "src": iconUrl,
                "type": mimeType,
                "sizes": "1024x1024",
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
});
