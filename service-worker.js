// service-worker.js

// Adjust paths for GitHub Pages if needed
const isGitHubPages = self.location.hostname.includes('github.io');
const basePath = isGitHubPages ? '/sng-hustle-board/' : '/';

const CACHE_NAME = 'sng-hustle-board-v1';
const ASSETS_TO_CACHE = [
  basePath,
  basePath + 'index.html',
  basePath + 'manifest.json',
  basePath + 'icon-192.png',
  basePath + 'icon-512.png',
  basePath + 'app.js',
  // External resources don't need path adjustment
  'https://www.gstatic.com/firebasejs/9.6.7/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore-compat.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@700;800&display=swap'
  // Note: The background image URL from raw.githubusercontent.com is not included here.
  // If you want to cache it, add it to this list as well.
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching assets:', ASSETS_TO_CACHE);
      return cache.addAll(ASSETS_TO_CACHE).catch(error => {
          console.error('[Service Worker] Failed to cache assets:', error);
          // Log which asset failed if possible
          if (error instanceof Response && error.status === 404) {
              console.error('[Service Worker] Asset not found (404):', error.url);
          } else if (error.message.includes('network error')) {
               console.error('[Service Worker] Network error while caching:', error.message);
          }
          // Continue despite error, but log it
          return Promise.resolve();
      });
    }).catch(error => {
        console.error('[Service Worker] Failed to open cache:', error);
        // Handle cache open failure
        return Promise.reject(error); // Propagate the error
    })
  );
  self.skipWaiting(); // Activate the new service worker immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      console.log('[Service Worker] Cleaning up old caches:', cacheNames);
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME) // Keep the current cache
          .map((cacheName) => {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName); // Delete other caches
          })
      );
    })
  );
  self.clients.claim(); // Take control of existing clients immediately
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Prevent fetching data from Firestore or other external APIs from being cached by this logic
  const requestUrl = new URL(event.request.url);
  if (requestUrl.hostname.includes('firestore.googleapis.com') || requestUrl.hostname.includes('firebaseio.com')) {
      return; // Don't intercept Firestore requests
  }
  if (requestUrl.protocol === 'chrome-extension:') {
       return; // Don't intercept browser extension requests
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => { // ignoreSearch helps match URLs with query parameters
      if (cachedResponse) {
        console.log('[Service Worker] Serving from cache:', event.request.url);
        return cachedResponse;
      }

      console.log('[Service Worker] Fetching from network:', event.request.url);
      return fetch(event.request).then((response) => {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          console.log('[Service Worker] Invalid response from network for:', event.request.url, response);
          return response;
        }

        // IMPORTANT: Clone the response. A response is a stream
        // and can only be consumed once. We must clone the response
        // so that we can serve the browser and cache the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
           console.log('[Service Worker] Caching new resource:', event.request.url);
           // Use the original request URL as the key in the cache
           cache.put(event.request, responseToCache).catch(error => {
               console.error('[Service Worker] Failed to cache resource:', event.request.url, error);
               // Handle potential quota exceeded errors or other caching failures
           });
        }).catch(error => {
            console.error('[Service Worker] Failed to open cache for caching:', error);
        });

        return response;
      }).catch(error => {
          console.error('[Service Worker] Network request failed for:', event.request.url, error);
           // Provide a fallback response for offline if the request was for an asset that should be cached but failed
           // You might want a specific offline page here
           if (ASSETS_TO_CACHE.includes(event.request.url) || ASSETS_TO_CACHE.includes(event.request.url.replace(requestUrl.origin, ''))) {
                console.log('[Service Worker] Providing offline fallback for failed request:', event.request.url);
               // Return a basic offline response or null
                return caches.match(basePath); // Attempt to serve the base path (e.g., index.html)
           }
          // For other requests, just re-throw the error or return a network error response
          throw error;
      });
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked', event.notification.tag);
  event.notification.close(); // Close the notification

  const taskId = event.notification.data?.taskId; // Get task ID from notification data

  event.waitUntil(
    clients.matchAll({type: 'window'}).then((clientsArr) => {
      const appClient = clientsArr.find(client => client.url.includes(basePath)); // Find an existing client for our app's scope

      if (appClient) {
        console.log('[Service Worker] Existing client found, focusing and sending message:', appClient.url);
        appClient.focus(); // Focus the existing window
        if (taskId) {
           // Send a message to the main app to focus on/highlight the specific task
           appClient.postMessage({
             command: 'FOCUS_TASK',
             taskId: taskId
           });
        }
      } else {
        // If no window is open for the app, open one at the base path
        console.log('[Service Worker] No existing client found, opening new window at:', basePath);
        clients.openWindow(basePath).then(newClient => {
            // You might want to send the FOCUS_TASK message to the new client once it's loaded
            // This would require additional logic in the main app to listen for messages on load
             if (taskId && newClient) {
                 // Basic example: wait a bit and send message (might need more robust method)
                 const messageInterval = setInterval(() => {
                     if (newClient.document && newClient.document.readyState === 'complete') {
                         newClient.postMessage({
                              command: 'FOCUS_TASK',
                              taskId: taskId
                         });
                         clearInterval(messageInterval);
                     }
                 }, 100); // Check every 100ms
             }
        });
      }
    })
  );
});

// Listen for push events (currently not used by the main app, but the listener is here)
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received');
  // The structure for handling push data remains the same
  if (event.data) {
    const data = event.data.json();
    console.log('[Service Worker] Push data:', data);

    const options = {
      body: data.body || 'Task update',
      icon: isGitHubPages ? '/sng-hustle-board/icon-192.png' : '/icon-192.png', // Updated icon path
      badge: isGitHubPages ? '/sng-hustle-board/icon-192.png' : '/icon-192.png', // Updated badge path
      tag: `task-${data.taskId}`, // Use tag to replace existing notification
      data: {
        taskId: data.taskId,
        taskText: data.taskText,
        timeUpdated: new Date().toISOString()
      },
      // Actions are included but won't work without explicit handling in notificationclick
      // and potentially communication back to the main app.
      actions: [
        {
          action: 'view',
          title: 'View Task'
        },
        {
          action: 'complete',
          title: 'Mark Complete'
        }
      ]
    };

    if (data.progressInfo) {
      options.body += `\n${data.progressInfo}`;
    }

    event.waitUntil(
      self.registration.showNotification(data.title || 'Hustle Board Update', options) // Added default title
    );
  } else {
      console.log('[Service Worker] Push event had no data');
  }
});

// Handle message events from the main app (used for periodic notifications)
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  // Handle task updates from the main app to update notifications
  if (event.data && event.data.type === 'UPDATE_TASK_NOTIFICATION') {
    const taskData = event.data.taskData;

    // Options for showing/updating the notification
    const options = {
      body: `${taskData.text}\n${taskData.progressInfo || ''}`,
      icon: isGitHubPages ? '/sng-hustle-board/icon-192.png' : '/icon-192.png', // Updated icon path
      badge: isGitHubPages ? '/sng-hustle-board/icon-192.png' : '/icon-192.png', // Updated badge path
      tag: `task-${taskData.id}`, // Use tag to replace existing notification
      renotify: true, // Important to alert user of update (on supported platforms)
      data: { // Include data for notificationclick handler
        taskId: taskData.id,
        taskText: taskData.text,
        timeUpdated: new Date().toISOString()
      },
       // Actions are included but won't work without explicit handling in notificationclick
       // and potentially communication back to the main app.
      actions: [
        {
          action: 'view',
          title: 'View Task'
        },
        {
          action: 'complete',
          title: 'Mark Complete'
        }
      ]
    };

     // Show the notification with a specific title
     console.log('[Service Worker] Showing notification for task:', taskData.id);
    event.waitUntil(
       self.registration.showNotification('Task in Progress Update', options) // Use a consistent title for updates
    );
  }
   // You could add handlers for other message types here if needed
});
