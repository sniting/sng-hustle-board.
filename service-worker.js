// service-worker.js
const CACHE_NAME = 'sng-hustle-board-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://www.gstatic.com/firebasejs/9.6.7/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.7/firebase-firestore-compat.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@700;800&display=swap',
  'https://raw.githubusercontent.com/sniting/sng-hustle-board./main/ChatGPT%20Image%20Apr%2030%2C%202025%20at%2007_19_36%20PM.png'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data?.taskId;
  
  if (taskId) {
    // Open the app and focus on the specific task if possible
    event.waitUntil(
      clients.matchAll({type: 'window'}).then((clientsArr) => {
        // If a window exists, focus it and navigate to the task
        if (clientsArr.length > 0) {
          clientsArr[0].focus();
          // You could send a message to focus on the specific task
          clientsArr[0].postMessage({
            command: 'FOCUS_TASK',
            taskId: taskId
          });
          return;
        }
        // If no window is open, open one
        clients.openWindow('/');
      })
    );
  }
});

// Listen for push events (will be used for task updates)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'Task update',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `task-${data.taskId}`,
      data: {
        taskId: data.taskId,
        taskText: data.taskText,
        timeUpdated: new Date().toISOString()
      },
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
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle message events from the main app
self.addEventListener('message', (event) => {
  // Handle task updates from the main app to update notifications
  if (event.data && event.data.type === 'UPDATE_TASK_NOTIFICATION') {
    const taskData = event.data.taskData;
    
    const options = {
      body: `${taskData.text}\n${taskData.progressInfo || ''}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `task-${taskData.id}`, // Use tag to replace existing notification
      renotify: true, // Important to alert user of update
      data: {
        taskId: taskData.id,
        taskText: taskData.text,
        timeUpdated: new Date().toISOString()
      },
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
    
    self.registration.showNotification('Task in Progress', options);
  }
});