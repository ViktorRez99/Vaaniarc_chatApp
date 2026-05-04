const STATIC_CACHE = 'vaaniarc-static-v2';
const RUNTIME_CACHE = 'vaaniarc-runtime-v2';
const OFFLINE_FALLBACK_URL = '/offline.html';
const APP_SHELL = [
  '/',
  OFFLINE_FALLBACK_URL,
  '/manifest.webmanifest',
  '/icon.svg',
  '/maskable-icon.svg',
  '/vendor/secrets.min.js'
];

const DEV_ONLY_PREFIXES = [
  '/@vite/',
  '/src/',
  '/node_modules/.vite/'
];

const shouldBypassCaching = (requestUrl) => (
  requestUrl.pathname.startsWith('/api/')
  || requestUrl.pathname.startsWith('/socket.io')
  || DEV_ONLY_PREFIXES.some((prefix) => requestUrl.pathname.startsWith(prefix))
  || requestUrl.pathname.includes('hot-update')
  || requestUrl.searchParams.has('t')
);

const shouldCacheResponse = (response) => Boolean(response && response.ok);

const putInCache = async (cacheName, request, response) => {
  if (!shouldCacheResponse(response)) {
    return;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(APP_SHELL);
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => ![STATIC_CACHE, RUNTIME_CACHE].includes(cacheName))
        .map((cacheName) => caches.delete(cacheName))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  if (request.method !== 'GET' || requestUrl.origin !== self.location.origin || shouldBypassCaching(requestUrl)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        await putInCache(RUNTIME_CACHE, request, networkResponse);
        return networkResponse;
      } catch (_ERROR) {
        const cachedResponse = await caches.match(request);
        return cachedResponse || caches.match(OFFLINE_FALLBACK_URL) || caches.match('/');
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cachedResponse = await caches.match(request);
    const networkRequest = fetch(request)
      .then(async (networkResponse) => {
        await putInCache(RUNTIME_CACHE, request, networkResponse);
        return networkResponse;
      })
      .catch(() => cachedResponse || Response.error());

    if (cachedResponse) {
      event.waitUntil(networkRequest);
      return cachedResponse;
    }

    return networkRequest;
  })());
});

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (_ERROR) {
    payload = {};
  }

  const title = payload.title || 'VaaniArc';
  const options = {
    body: payload.body || 'Open VaaniArc to continue.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.tag || 'vaaniarc-notification',
    data: {
      url: payload.url || '/chat'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/chat';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });
    const matchingClient = allClients.find((client) => client.url.includes(self.location.origin));

    if (matchingClient) {
      if (typeof matchingClient.navigate === 'function') {
        await matchingClient.navigate(targetUrl);
      }
      await matchingClient.focus();
      return;
    }

    await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
