// service-worker.js

// Determine the base path dynamically from the service worker location
// This supports repositories with unusual names (e.g. with trailing dots)
const basePath = self.location.pathname.replace(/service-worker\.js$/, '');

const CACHE_NAME = 'sng-hustle-board-v3'; // Increment cache version when you update the service worker
// Add URLs of essential files to cache initially
const urlsToCache = [
  basePath,
  basePath + 'index.html',
  basePath + 'manifest.json',
  basePath + 'icon-192.png',
  basePath + 'icon-512.png',
  // External resources don't need path adjustment
  'https://www.gstatic.com/firebasejs/9.6.7/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.7/firebase-auth-compat.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@700;800&display=swap'
  // Background image is loaded from raw.githubusercontent.com
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  
  // Wait until the caching is complete
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      
      // First cache the index.html (most critical file)
      return cache.add(basePath + 'index.html')
        .then(() => {
          console.log('Index.html cached successfully');
          
          // Then cache the rest (if index.html caching fails, the service worker won't install)
          return Promise.all(
            urlsToCache.map(urlToCache => {
              // Skip index.html since we already cached it
              if (urlToCache === basePath + 'index.html') return Promise.resolve();
              
              return cache.add(urlToCache)
                .catch(err => {
                  console.warn(`[Service Worker] Non-critical file caching failed for ${urlToCache}`, err);
                  // Continue installation even if non-critical resources fail to cache
                  return Promise.resolve();
                });
            })
          );
        });
    }).then(() => {
      console.log('[Service Worker] Install completed, skipping waiting.');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  const cacheWhitelist = [CACHE_NAME]; // Only keep the current cache version
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        console.log('[Service Worker] Found caches:', cacheNames);
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName); // Delete other caches
            }
            return Promise.resolve();
          })
        );
      }),
      
      // Take control of all open clients immediately
      self.clients.claim().then(() => {
        console.log('[Service Worker] Claimed all clients');
      })
    ])
  );
});

// Create offline page content
const offlineHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SNG's Hustle Board - Offline</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 20px; background-color: #374151; color: white; }
    h1 { margin-bottom: 20px; }
    .container { max-width: 500px; margin: 60px auto; background: rgba(30, 41, 59, 0.8); padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    button { background-color: #dc2626; color: white; border: none; padding: 10px 20px; border-radius: 5px; font-weight: bold; cursor: pointer; margin-top: 20px; }
    button:hover { background-color: #b91c1c; }
    p { line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <h1>SNG's Hustle Board</h1>
    <p>You appear to be offline. The app requires an internet connection for cloud sync.</p>
    <p>Your previously loaded data should still be available in offline mode.</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>`;

// Create the offline response object
const offlineResponse = new Response(offlineHTML, {
  headers: { 'Content-Type': 'text/html' }
});

// Fetch event - Improved network-first strategy with fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip Firebase API requests (these should use their own offline logic)
  const requestUrl = new URL(event.request.url);
  if (requestUrl.hostname.includes('firestore.googleapis.com') || 
      requestUrl.hostname.includes('firebaseio.com') ||
      requestUrl.hostname.includes('googleapis.com')) {
      return; // Don't intercept Firebase requests
  }
  
  // Skip browser extension requests
  if (requestUrl.protocol === 'chrome-extension:') {
       return;
  }
  
  // Handle navigation requests (app shell)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // Try network first
      fetch(event.request)
        .catch(() => {
          // If network fails, try to serve index.html from cache
          return caches.match(basePath + 'index.html')
            .then(cachedIndex => {
              if (cachedIndex) {
                console.log('[Service Worker] Serving cached index.html for navigation');
                return cachedIndex;
              }
              // As a last resort, show the offline page
              console.log('[Service Worker] Serving offline page');
              return offlineResponse;
            });
        })
    );
    return;
  }
  
  // For static assets (scripts, styles, images), use cache-first strategy
  if (event.request.destination === 'script' || 
      event.request.destination === 'style' || 
      event.request.destination === 'font' ||
      event.request.destination === 'image') {
    
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // Cache hit - return response
            console.log('[Service Worker] Serving from cache:', event.request.url);
            return cachedResponse;
          }
          
          // No cache hit - fetch from network and cache for next time
          return fetch(event.request)
            .then(networkResponse => {
              // Check if we received a valid response
              if (!networkResponse || networkResponse.status !== 200) {
                return networkResponse;
              }
              
              // Clone the response before using it and caching it
              const responseToCache = networkResponse.clone();
              
              // Cache the fetched resource
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                  console.log('[Service Worker] Cached new resource:', event.request.url);
                });
                
              return networkResponse;
            })
            .catch(error => {
              console.error('[Service Worker] Fetch failed for asset:', error);
              // For image requests, you could return a default placeholder
              if (event.request.destination === 'image') {
                return caches.match(basePath + 'icon-192.png'); // Return app icon as fallback
              }
              throw error;
            });
        })
    );
    return;
  }
  
  // For everything else, try network with 3-second timeout, then fall back to cache
  event.respondWith(
    Promise.race([
      // Network request with timeout
      new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('timeout')), 3000); // 3 second timeout
        fetch(event.request.clone()).then(resolve, reject);
      }),
      
      // Cache lookup (will only be used if network is too slow or fails)
      new Promise(resolve => {
        caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) resolve(cachedResponse);
        });
      })
    ])
    .catch(() => {
      // If both network and cache fail, or if network times out
      return caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          
          // For HTML requests, serve the offline page as last resort
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return offlineResponse;
          }
          
          // Actually try the network again without a timeout as last resort
          return fetch(event.request).catch(() => offlineResponse);
        });
    })
  );
});

// Periodic sync to check for updates (not widely supported yet)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-for-updates') {
    event.waitUntil(
      // Check for updates to app assets
      caches.open(CACHE_NAME).then(cache => {
        return Promise.all(
          urlsToCache.map(url => 
            fetch(url, { cache: 'no-cache' })
              .then(response => {
                if (response.ok) {
                  cache.put(url, response);
                  console.log('[Service Worker] Updated cached asset:', url);
                }
              })
              .catch(err => console.error('[Service Worker] Failed to check for update:', url, err))
          )
        );
      })
    );
  }
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CHECK_FOR_UPDATES') {
    // Same logic as periodic sync
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        return Promise.all(
          urlsToCache.map(url => 
            fetch(url, { cache: 'no-cache' })
              .then(response => {
                if (response.ok) {
                  cache.put(url, response);
                  console.log('[Service Worker] Updated cached asset:', url);
                }
              })
              .catch(err => console.error('[Service Worker] Failed to check for update:', url, err))
          )
        );
      })
    );
  }
});
