const CACHE_NAME = 'marilab-mover-shell-v1.8.2';
const BADGE_CACHE_NAME = 'marilab-mover-badge-state-v1';
const BADGE_STATE_URL = '/__marilab_mover_badge_state__';
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-192-v182.png',
  '/icons/icon-512-v182.png',
  '/icons/apple-touch-icon-180-v182.png',
  '/notification-badge.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME && key !== BADGE_CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

async function notifyOpenClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

function badgeStateRequest() {
  return new Request(new URL(BADGE_STATE_URL, self.location.origin).href);
}

async function readBadgeState() {
  try {
    const cache = await caches.open(BADGE_CACHE_NAME);
    const response = await cache.match(badgeStateRequest());
    if (!response) return { count: 0, seen: [] };
    const state = await response.json();
    return {
      count: Number.isFinite(Number(state?.count)) ? Math.max(0, Number(state.count)) : 0,
      seen: Array.isArray(state?.seen) ? state.seen.map(String).slice(-250) : [],
    };
  } catch {
    return { count: 0, seen: [] };
  }
}

async function persistBadgeState(state) {
  try {
    const cache = await caches.open(BADGE_CACHE_NAME);
    await cache.put(
      badgeStateRequest(),
      new Response(JSON.stringify({ count: state.count, seen: state.seen.slice(-250) }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch {
    // Il badge resta comunque aggiornabile anche se Cache Storage non è disponibile.
  }
}

async function applySystemBadge(count) {
  const normalized = Math.max(0, Math.min(999, Math.trunc(Number(count) || 0)));
  try {
    if (normalized > 0 && typeof navigator.setAppBadge === 'function') {
      await navigator.setAppBadge(normalized);
    } else if (normalized === 0 && typeof navigator.clearAppBadge === 'function') {
      await navigator.clearAppBadge();
    } else if (normalized === 0 && typeof navigator.setAppBadge === 'function') {
      await navigator.setAppBadge(0);
    }
  } catch {
    // Alcuni sistemi mostrano il badge automaticamente dalla notifica.
  }
  return normalized;
}

async function syncBadgeCount(count) {
  const state = await readBadgeState();
  state.count = await applySystemBadge(count);
  await persistBadgeState(state);
  return state.count;
}

async function updateBadgeFromPush(payload) {
  const state = await readBadgeState();
  const notificationId = payload?.notificationId == null ? '' : String(payload.notificationId);
  const exactCount = Number(payload?.unreadCount);

  if (Number.isFinite(exactCount) && exactCount >= 0) {
    state.count = Math.trunc(exactCount);
  } else if (!notificationId || !state.seen.includes(notificationId)) {
    state.count += 1;
  }

  if (notificationId && !state.seen.includes(notificationId)) state.seen.push(notificationId);
  state.count = await applySystemBadge(state.count);
  await persistBadgeState(state);
  return state.count;
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : 'Nuovo aggiornamento Marilab Mover.' };
  }

  const title = payload.title || 'Marilab Mover';
  const options = {
    body: payload.body || 'Nuovo aggiornamento operativo.',
    icon: '/icons/icon-192-v182.png',
    badge: '/notification-badge.png',
    tag: payload.tag || `marilab-mover-${payload.notificationId || Date.now()}`,
    renotify: true,
    data: {
      url: payload.url || '/',
      notificationId: payload.notificationId,
      requestId: payload.requestId,
      kind: payload.kind,
    },
  };

  event.waitUntil((async () => {
    const unreadCount = await updateBadgeFromPush(payload);
    await Promise.all([
      self.registration.showNotification(title, options),
      notifyOpenClients({
        type: 'MARILAB_PUSH_RECEIVED',
        notificationId: payload.notificationId,
        unreadCount,
      }),
    ]);
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'MARILAB_BADGE_SYNC') {
    event.waitUntil(syncBadgeCount(data.count));
  }
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(notifyOpenClients({ type: 'MARILAB_PUSH_SUBSCRIPTION_CHANGED' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) await client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    }),
  );
});
