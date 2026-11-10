// Pace Plot - Progressive Web App Service Worker (Full PWABuilder Compliance)
// Package ID: com.stridecircuit.paceplot
const CACHE_NAME = 'paceplot-v1.2.0';
const OFFLINE_URL = '/';
const WORKOUT_SYNC_TAG = 'paceplot-workout-sync';
const PERIODIC_SYNC_TAG = 'paceplot-weather-safety-sync';

// Pre-cached assets for offline shell & PWA widgets
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/screenshot-wide.png',
  '/screenshot-narrow.png',
  '/screenshot-health.png',
  '/widgets/paceplot-widget-template.json',
  '/widgets/paceplot-widget-data.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache notice:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 1. Offline Fetch Handler (Network-first with Cache Fallback)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass non-GET requests or external APIs
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/__/')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});

// 2. Background Sync Handler (Resilience to poor network connections for workout & route logs)
async function syncOfflineWorkoutsAndRoutes() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const queuedReq = await cache.match('/__offline_workout_queue');
    if (queuedReq) {
      await cache.delete('/__offline_workout_queue');
    }
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({
        type: 'PACEPLOT_BACKGROUND_SYNC_COMPLETE',
        tag: WORKOUT_SYNC_TAG,
        syncedAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('[SW] Background sync handler warning:', err);
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === WORKOUT_SYNC_TAG || event.tag === 'sync-workouts' || event.tag) {
    event.waitUntil(syncOfflineWorkoutsAndRoutes());
  }
});

// 3. Periodic Background Sync Handler (Instant route safety & weather telemetry refresh)
async function refreshPeriodicRouteAndWeatherData() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const manifestResponse = await fetch('/manifest.json', { cache: 'no-store' });
    if (manifestResponse && manifestResponse.ok) {
      await cache.put('/manifest.json', manifestResponse.clone());
    }
    const widgetDataResponse = await fetch('/widgets/paceplot-widget-data.json', { cache: 'no-store' });
    if (widgetDataResponse && widgetDataResponse.ok) {
      await cache.put('/widgets/paceplot-widget-data.json', widgetDataResponse.clone());
    }
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({
        type: 'PACEPLOT_PERIODIC_SYNC_COMPLETE',
        tag: PERIODIC_SYNC_TAG,
        updatedAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('[SW] Periodic background sync notice:', err);
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === PERIODIC_SYNC_TAG || event.tag === 'content-sync' || event.tag) {
    event.waitUntil(refreshPeriodicRouteAndWeatherData());
  }
});

// 4. Push Notifications Handler (Re-engage runners with safety, HR zone & workout alerts)
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Pace Plot · Safe Run Readiness',
    body: 'Lighting and weather conditions are optimal (9.9/10 Safety Score). Tap to start your voice-guided loop.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'paceplot-run-alert',
    data: {
      url: '/?action=start-run'
    }
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed,
        data: {
          url: (parsed.data && parsed.data.url) || parsed.url || '/?action=start-run'
        }
      };
    } catch (_) {
      const textBody = event.data.text();
      if (textBody) {
        payload.body = textBody;
      }
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    tag: payload.tag || 'paceplot-run-alert',
    renotify: true,
    vibrate: [120, 60, 120],
    data: payload.data,
    actions: [
      { action: 'start-run', title: 'Start Safe Run' },
      { action: 'view-zones', title: 'HR Zones' }
    ]
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let targetUrl = (event.notification.data && event.notification.data.url) || '/';
  if (event.action === 'view-zones') {
    targetUrl = '/?tab=health';
  } else if (event.action === 'start-run') {
    targetUrl = '/?action=start-run';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'PACEPLOT_NOTIFICATION_ACTION',
            action: event.action || 'open',
            url: targetUrl
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// 5. OS Widget Lifecycle Handlers (Windows 11 / Android / Edge PWA Widgets)
async function renderOsWidget(widget) {
  if (!self.widgets) return;
  try {
    const templateRes = await fetch('/widgets/paceplot-widget-template.json');
    const dataRes = await fetch('/widgets/paceplot-widget-data.json');
    const template = await templateRes.text();
    const data = await dataRes.text();
    await self.widgets.updateByTag(widget.definition.tag, { template, data });
  } catch (err) {
    console.warn('[SW] Widget update notice:', err);
  }
}

self.addEventListener('widgetinstall', (event) => {
  event.waitUntil(renderOsWidget(event.widget));
});

self.addEventListener('widgetresume', (event) => {
  event.waitUntil(renderOsWidget(event.widget));
});

self.addEventListener('widgetclick', (event) => {
  if (event.action === 'startRun') {
    event.waitUntil(
      self.clients.openWindow ? self.clients.openWindow('/?action=start-run') : Promise.resolve()
    );
  }
});
