const CACHE_NAME = 'refex-super-app-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function isAppShellRequest(request) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url || '';
  if (url.includes('/api/')) return;
  if (!url.startsWith(self.location.origin)) return;

  // Login / launcher HTML must always come from the network so a new deploy
  // is used on first login. Do not put index.html in the cache.
  if (isAppShellRequest(event.request)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
