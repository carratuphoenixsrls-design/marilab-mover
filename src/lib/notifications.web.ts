import type { PushRegistrationResult, WebPushSubscriptionPayload } from './notifications';

const VAPID_STORAGE_KEY = 'marilab-mover-web-push-vapid-public-key';
const SERVER_VAPID_STORAGE_KEY = 'marilab-mover-server-vapid-public-key';

// La chiave VAPID pubblica può essere distribuita nel client: non è un segreto.
// Resta un fallback per evitare che una variabile Vercel mancante blocchi il browser.
const DEFAULT_WEB_PUSH_VAPID_PUBLIC_KEY = 'BARtzKfQwCDIS-PCD9V64iT1Q_yuHVHZ1XG_WQEepZo65M5N-K_hYi4piP9rFIKVscuPNRJ2xwS5jsrtsakqp6s';

function normalizeVapidPublicKey(value: string) {
  let normalized = value.trim();
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\s+/g, '');
}

function isValidVapidPublicKey(value: string) {
  return /^[A-Za-z0-9_-]{80,100}$/.test(value);
}

function urlBase64ToUint8Array(value: string) {
  const normalized = normalizeVapidPublicKey(value);
  if (!isValidVapidPublicKey(normalized)) {
    throw new Error('La chiave pubblica Web Push contiene caratteri non validi.');
  }
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const base64 = (normalized + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = globalThis.atob(base64);
  const bytes = Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error('La chiave pubblica VAPID non è valida.');
  }
  return bytes;
}

function arrayBufferToBase64Url(value: ArrayBuffer | null) {
  if (!value) return '';
  const bytes = new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function isIosLike() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneWebApp() {
  if (typeof globalThis.matchMedia !== 'function' || typeof navigator === 'undefined') return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return globalThis.matchMedia('(display-mode: standalone)').matches
    || navigatorWithStandalone.standalone === true;
}

function readableError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Permesso notifiche negato. Riabilitalo nelle impostazioni del browser o di iPhone.';
    if (error.name === 'InvalidAccessError') return 'Chiave Web Push non valida o diversa da quella del server.';
    if (error.name === 'InvalidStateError') return 'Il Service Worker non è ancora pronto. Chiudi e riapri l’app, poi riprova.';
    if (error.name === 'AbortError') return 'Il servizio push del browser non ha completato la registrazione. Riprova tra pochi secondi.';
    if (error.name === 'SecurityError') return 'Il browser ha bloccato Web Push per questo sito. Controlla HTTPS e i permessi.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Registrazione Web Push non riuscita.';
}

function vapidKeyChanged(subscription: PushSubscription, publicKey: string) {
  const subscriptionKey = arrayBufferToBase64Url(subscription.options?.applicationServerKey ?? null);
  if (subscriptionKey && subscriptionKey !== publicKey) return true;

  try {
    const storedKey = globalThis.localStorage?.getItem(VAPID_STORAGE_KEY);
    return Boolean(storedKey && storedKey !== publicKey);
  } catch {
    return false;
  }
}

function rememberSubscriptionKey(publicKey: string) {
  try {
    globalThis.localStorage?.setItem(VAPID_STORAGE_KEY, publicKey);
  } catch {
    // La sottoscrizione resta valida anche se lo storage locale non è disponibile.
  }
}

export function cacheWebPushPublicKey(value: string) {
  const normalized = normalizeVapidPublicKey(value);
  if (!isValidVapidPublicKey(normalized)) return false;
  try {
    globalThis.localStorage?.setItem(SERVER_VAPID_STORAGE_KEY, normalized);
  } catch {
    // Il fallback incorporato resta disponibile.
  }
  return true;
}

function readCachedServerKey() {
  try {
    return normalizeVapidPublicKey(globalThis.localStorage?.getItem(SERVER_VAPID_STORAGE_KEY) ?? '');
  } catch {
    return '';
  }
}

export function getConfiguredWebPushPublicKey() {
  const cachedServerKey = readCachedServerKey();
  if (isValidVapidPublicKey(cachedServerKey)) return cachedServerKey;

  const environmentKey = normalizeVapidPublicKey(process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY ?? '');
  if (isValidVapidPublicKey(environmentKey)) return environmentKey;

  return DEFAULT_WEB_PUSH_VAPID_PUBLIC_KEY;
}

export async function prepareWebPushServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  const existing = await navigator.serviceWorker.getRegistration('/');
  const registration = existing ?? await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  await registration.update().catch(() => undefined);
  return registration;
}

export async function registerForPushNotificationsAsync(requestPermission = false): Promise<PushRegistrationResult> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { ok: false, permission: 'unsupported', error: 'Web Push disponibile soltanto nel browser.' };
  }
  if (!window.isSecureContext) {
    return { ok: false, permission: 'unsupported', error: 'Le notifiche web richiedono HTTPS.' };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, permission: 'unsupported', error: 'Questo browser non supporta Web Push.' };
  }
  if (isIosLike() && !isStandaloneWebApp()) {
    return {
      ok: false,
      permission: 'install_required',
      error: 'Su iPhone aggiungi Marilab Mover alla schermata Home, aprila dall’icona e poi attiva le notifiche.',
    };
  }

  const publicKey = getConfiguredWebPushPublicKey();
  if (!publicKey) {
    return { ok: false, permission: 'configuration_missing', error: 'Chiave pubblica Web Push non configurata.' };
  }

  try {
    // Avviamo il Service Worker senza attendere: il prompt resta direttamente legato al tap.
    const registrationPromise = prepareWebPushServiceWorker();
    let permission = Notification.permission;
    if (permission === 'default') {
      if (!requestPermission) {
        return {
          ok: false,
          permission: 'prompt',
          error: 'Apri “Notifiche push” e premi “Attiva su questo dispositivo”.',
        };
      }
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      return { ok: false, permission, error: 'Permesso notifiche bloccato nel browser. Riabilitalo nelle impostazioni del sito.' };
    }

    const registration = await registrationPromise;
    if (!registration) {
      return { ok: false, permission, error: 'Service Worker Web Push non disponibile.' };
    }
    await navigator.serviceWorker.ready;

    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    let subscription = await registration.pushManager.getSubscription();
    let renewed = false;
    if (subscription && vapidKeyChanged(subscription, publicKey)) {
      await subscription.unsubscribe();
      subscription = null;
      renewed = true;
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    rememberSubscriptionKey(publicKey);
    const json = subscription.toJSON() as WebPushSubscriptionPayload;
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, permission, error: 'Il browser non ha restituito una sottoscrizione Web Push completa.' };
    }

    return {
      ok: true,
      provider: 'web',
      subscription: json,
      permission,
      deviceName: `${navigator.platform || 'Browser'} · ${navigator.userAgent.slice(0, 120)}${renewed ? ' · chiave aggiornata' : ''}`,
    };
  } catch (error) {
    return { ok: false, permission: Notification.permission || 'error', error: readableError(error) };
  }
}


export function subscribeToPushTokenRefresh(_listener: (result: PushRegistrationResult) => void) {
  return () => undefined;
}

export function subscribeToNotificationActivity(listener: () => void) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => undefined;
  const handler = (event: MessageEvent) => {
    const type = String((event.data as { type?: unknown } | null)?.type ?? '');
    if (type === 'MARILAB_PUSH_RECEIVED' || type === 'MARILAB_PUSH_SUBSCRIPTION_CHANGED') listener();
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}

export async function showDemoNotification(title: string, body: string) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
  const registration = await prepareWebPushServiceWorker();
  if (!registration) return;
  await registration.showNotification(title, {
    body,
    icon: '/icons/icon-192-v182.png',
    badge: '/notification-badge.png',
    tag: 'marilab-mover-demo',
  });
}

export async function syncAppBadgeCount(count: number) {
  if (typeof navigator === 'undefined') return false;
  const normalized = Math.max(0, Math.min(999, Math.trunc(count)));
  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (value?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };

  let supported = false;
  try {
    if (normalized > 0 && badgeNavigator.setAppBadge) {
      await badgeNavigator.setAppBadge(normalized);
      supported = true;
    } else if (normalized === 0 && badgeNavigator.clearAppBadge) {
      await badgeNavigator.clearAppBadge();
      supported = true;
    } else if (normalized === 0 && badgeNavigator.setAppBadge) {
      await badgeNavigator.setAppBadge(0);
      supported = true;
    }
  } catch {
    // Il Service Worker prova comunque a sincronizzare il conteggio persistente.
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const worker = navigator.serviceWorker.controller ?? registration?.active ?? registration?.waiting;
      worker?.postMessage({ type: 'MARILAB_BADGE_SYNC', count: normalized });
    }
  } catch {
    // Nessun blocco dell’app se il Service Worker non è ancora pronto.
  }

  return supported;
}
