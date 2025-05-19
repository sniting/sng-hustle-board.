// Service Worker for SNG's Hustle Board PWA

const CACHE_NAME = 'hustle-board-v1.0';

// Files to cache
const filesToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  'https://www.gstatic.com/firebasejs/9.6.7/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.7/firebase-auth-compat.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@700;800&display=swap',
  'https://raw.githubusercontent.com/sniting/sng-hustle-board./main/ChatGPT%20Image%20Apr%2030%2C%202025%20at%2007_19_36%20PM.png'
];

// Install event - caches app shell
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install');
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(filesToCache);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate');
  
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  
  return self.clients.claim();
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) &&
      !event.request.url.startsWith('https://fonts.googleapis.com') &&
      !event.request.url.startsWith('https://www.gstatic.com') &&
      !event.request.url.startsWith('https://cdn.tailwindcss.com') &&
      !event.request.url.startsWith('https://cdn.jsdelivr.net') &&
      !event.request.url.startsWith('https://raw.githubusercontent.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // For navigation requests (page loads), always return index.html if not in cache
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html')
            .then(indexResponse => {
              if (indexResponse) {
                return indexResponse;
              }
              return fetch(event.request);
            });
        }
        
        // Otherwise, fetch from network
        return fetch(event.request)
          .then(response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response because it's a stream that can only be consumed once
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                // Add the new response to the cache
                cache.put(event.request, responseToCache);
              });
              
            return response;
          })
          .catch(() => {
            // If fetch fails (e.g., offline) try to return index.html for navigation
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
