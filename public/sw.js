// Service Worker for caching images and videos
const CACHE_NAME = 'streaming-slides-cache-v1';

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - cache images and videos
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only cache images and videos from ImageKit or similar CDNs
  const shouldCache = 
    event.request.method === 'GET' &&
    (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|ogg)$/i) ||
     url.hostname.includes('imagekit.io'));

  if (!shouldCache) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((response) => {
        if (response) {
          // Return cached version
          return response;
        }

        // Fetch from network and cache
        return fetch(event.request).then((response) => {
          // Only cache successful responses
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      });
    })
  );
});

