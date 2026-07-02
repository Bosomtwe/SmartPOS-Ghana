// src/sw.js
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, setDefaultHandler, setCatchHandler } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// ✅ Install event – make the new SW active immediately
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// ✅ Activate event – take control of all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Optional: reload all open tabs to apply the new SW
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.navigate(client.url);
        });
      }),
    ])
  );
});

// 1. Precache all static assets (injected by Vite)
precacheAndRoute(self.__WB_MANIFEST);

// 2. Navigation requests – serve from cache (app-shell) and update in background
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new StaleWhileRevalidate({
    cacheName: 'app-shell',
    plugins: [new ExpirationPlugin({ maxEntries: 1 })],
  })
);

// 3. Static assets (images, fonts) – cache first, fallback to network
registerRoute(
  /\.(png|svg|jpg|jpeg|webp|woff|woff2)$/,
  new CacheFirst({
    cacheName: 'assets-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 86400 })],
  })
);

// 4. Default handler for any other GET requests (scripts, styles, API calls, etc.)
setDefaultHandler(
  new StaleWhileRevalidate({ cacheName: 'default-cache' })
);

// 5. 🛡️ Catch-all fallback – handle failures gracefully WITHOUT breaking scripts
setCatchHandler(async ({ event }) => {
  const { request } = event;
  const url = new URL(request.url);

  // ✅ API requests → JSON error
  if (url.pathname.startsWith('/api/')) {
    return new Response(
      JSON.stringify({ error: 'Offline', detail: 'You are offline' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // ✅ Navigation requests → app shell (index.html)
  if (request.destination === 'document' || request.mode === 'navigate') {
    const indexHandler = createHandlerBoundToURL('/index.html');
    try {
      const response = await indexHandler({ event, request });
      if (response) return response;
    } catch {
      // fall through
    }
    // Ultimate fallback for navigations
    return new Response('Offline – please connect to the internet', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // ✅ For any other request (scripts, styles, images, fonts, etc.)
  // Return a network error – do NOT serve HTML as a replacement.
  // This prevents the “Expected a JavaScript module” error.
  return Response.error();
});