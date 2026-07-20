import webpush from 'npm:web-push@3.6.7';

export type WebPushRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushPayload = {
  title: string;
  body: string;
  notificationId?: number;
  requestId?: string | null;
  kind?: string;
  url?: string;
  tag?: string;
};

export type WebPushOutcome = {
  id: number;
  result: 'sent' | 'invalid' | 'refresh' | 'retry' | 'failed';
  statusCode: number;
  message?: string;
};

type WebPushFailure = {
  id: number;
  statusCode: number;
  message: string;
};

const WEB_PUSH_SOCKET_TIMEOUT_MS = 8_000;

function normalizeSecret(value: string | undefined) {
  if (!value) return '';
  let normalized = value.trim();
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\s+/g, '');
}

function isValidPublicKey(value: string) {
  return /^[A-Za-z0-9_-]{80,100}$/.test(value);
}

function isValidPrivateKey(value: string) {
  return /^[A-Za-z0-9_-]{40,60}$/.test(value);
}

function errorStatus(error: unknown) {
  if (typeof error === 'object' && error && 'statusCode' in error) {
    return Number((error as { statusCode?: unknown }).statusCode) || 0;
  }
  return 0;
}

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'body' in error) return String((error as { body?: unknown }).body ?? 'Errore Web Push');
  return 'Errore Web Push';
}

function classifyFailure(statusCode: number): WebPushOutcome['result'] {
  if (statusCode === 404 || statusCode === 410) return 'invalid';
  if (statusCode === 401 || statusCode === 403) return 'refresh';
  if (statusCode === 0 || statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500) return 'retry';
  return 'failed';
}

export async function sendWebPushBatch(rows: WebPushRow[], payload: WebPushPayload) {
  if (!rows.length) {
    return {
      sent: 0,
      invalidIds: [] as number[],
      refreshIds: [] as number[],
      retryIds: [] as number[],
      failures: [] as WebPushFailure[],
      outcomes: [] as WebPushOutcome[],
      configured: true,
    };
  }

  const publicKey = normalizeSecret(Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY'));
  const privateKey = normalizeSecret(Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY'));
  const subject = (Deno.env.get('WEB_PUSH_VAPID_SUBJECT') || 'mailto:assistenza@marilab.it').trim();
  if (!publicKey || !privateKey || !isValidPublicKey(publicKey) || !isValidPrivateKey(privateKey)) {
    return {
      sent: 0,
      invalidIds: [] as number[],
      refreshIds: [] as number[],
      retryIds: rows.map((row) => row.id),
      failures: [{ id: 0, statusCode: 0, message: 'Segreti VAPID mancanti o non validi.' }],
      outcomes: rows.map((row) => ({ id: row.id, result: 'retry' as const, statusCode: 0, message: 'Segreti VAPID mancanti o non validi.' })),
      configured: false,
    };
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  let sent = 0;
  const invalidIds: number[] = [];
  const refreshIds: number[] = [];
  const retryIds: number[] = [];
  const failures: WebPushFailure[] = [];
  const outcomes: WebPushOutcome[] = [];

  // Ogni richiesta ha un timeout socket esplicito: senza questo limite il
  // gateway può lasciare la Promise sospesa fino alla terminazione della Edge Function,
  // mantenendo la consegna bloccata nello stato "processing".
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(payload),
        {
          TTL: 86400,
          urgency: 'high',
          contentEncoding: 'aes128gcm',
          timeout: WEB_PUSH_SOCKET_TIMEOUT_MS,
        },
      );
      sent += 1;
      outcomes.push({ id: row.id, result: 'sent', statusCode: 201 });
    } catch (error) {
      const statusCode = errorStatus(error);
      const message = errorText(error).slice(0, 500);
      const result = classifyFailure(statusCode);
      if (result === 'invalid') invalidIds.push(row.id);
      if (result === 'refresh') refreshIds.push(row.id);
      if (result === 'retry') retryIds.push(row.id);
      failures.push({ id: row.id, statusCode, message });
      outcomes.push({ id: row.id, result, statusCode, message });
      console.error('Web Push error', row.id, statusCode, message);
    }
  }

  return { sent, invalidIds, refreshIds, retryIds, failures, outcomes, configured: true };
}
