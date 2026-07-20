import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  dispatchPushNotification,
  enqueuePushDeliveries,
  type PushTargetFilter,
} from '../_shared/push-dispatch.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePublicKey(value: string | undefined) {
  if (!value) return '';
  let normalized = value.trim();
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\s+/g, '');
}

function isValidExpoToken(value: string) {
  return /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(value);
}

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ ok: false, error: 'Metodo non consentito.' }, 405);

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return response({ ok: false, error: 'Sessione mancante.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return response({ ok: false, error: 'Sessione non valida.' }, 401);

    const { data: caller, error: callerError } = await adminClient
      .from('profiles')
      .select('id, active, role')
      .eq('id', authData.user.id)
      .single();
    if (callerError || !caller?.active) return response({ ok: false, error: 'Account non attivo.' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? 'send');

    if (action === 'config') {
      const publicKey = normalizePublicKey(Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY'));
      const privateKey = normalizePublicKey(Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY'));
      const subject = String(Deno.env.get('WEB_PUSH_VAPID_SUBJECT') ?? '').trim();
      const configured = Boolean(publicKey && privateKey && subject);
      return response({ ok: configured, configured, vapidPublicKey: publicKey });
    }

    if (action === 'register') {
      const publicKey = normalizePublicKey(Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY'));
      const clientPublicKey = normalizePublicKey(String(body?.clientPublicKey ?? ''));
      if (!publicKey) throw new Error('Chiave pubblica VAPID assente nei segreti Supabase.');
      if (!clientPublicKey || clientPublicKey !== publicKey) {
        throw new Error('La chiave Web Push del browser non coincide con quella del server.');
      }

      const subscription = body?.subscription as {
        endpoint?: unknown;
        expirationTime?: unknown;
        keys?: { p256dh?: unknown; auth?: unknown };
        p256dh?: unknown;
        auth?: unknown;
      } | undefined;
      const endpoint = String(subscription?.endpoint ?? body?.endpoint ?? '').trim();
      const p256dh = String(subscription?.keys?.p256dh ?? subscription?.p256dh ?? body?.p256dh ?? '').trim();
      const auth = String(subscription?.keys?.auth ?? subscription?.auth ?? body?.auth ?? '').trim();
      const userAgent = String(body?.userAgent ?? '').slice(0, 1000);
      if (!endpoint.startsWith('https://') || !p256dh || !auth) {
        return response({
          ok: false,
          error: 'Sottoscrizione Web Push incompleta o non valida.',
          fields: {
            endpoint: endpoint.startsWith('https://'),
            p256dh: Boolean(p256dh),
            auth: Boolean(auth),
          },
        }, 400);
      }

      const { error: registrationError } = await adminClient.from('web_push_subscriptions').upsert({
        user_id: authData.user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent || null,
        active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (registrationError) throw registrationError;

      return response({
        ok: true,
        registered: true,
        provider: 'web',
        vapidPublicKey: publicKey,
        endpointPreview: `${endpoint.slice(0, 28)}…${endpoint.slice(-12)}`,
      });
    }

    if (action === 'register_native') {
      const token = String(body?.token ?? '').trim();
      const platform = String(body?.platform ?? '').trim().toLowerCase();
      const deviceName = String(body?.deviceName ?? '').trim().slice(0, 500);
      if (!isValidExpoToken(token)) throw new Error('Token Expo Push non valido.');
      if (!['android', 'ios'].includes(platform)) throw new Error('Piattaforma push nativa non valida.');

      const { error: registrationError } = await adminClient.from('push_tokens').upsert({
        user_id: authData.user.id,
        expo_push_token: token,
        platform,
        device_name: deviceName || null,
        active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'expo_push_token' });
      if (registrationError) throw registrationError;

      return response({
        ok: true,
        registered: true,
        provider: 'expo',
        tokenPreview: `${token.slice(0, 18)}…${token.slice(-8)}`,
      });
    }

    if (action === 'unregister') {
      const provider = String(body?.provider ?? '');
      const key = String(body?.key ?? '').trim();
      if (!key || !['expo', 'web'].includes(provider)) throw new Error('Dispositivo push non valido.');
      const query = provider === 'web'
        ? adminClient.from('web_push_subscriptions').delete().eq('user_id', authData.user.id).eq('endpoint', key)
        : adminClient.from('push_tokens').delete().eq('user_id', authData.user.id).eq('expo_push_token', key);
      const { error } = await query;
      if (error) throw error;
      return response({ ok: true, unregistered: true });
    }

    const notificationId = Number(body?.notificationId);
    if (!Number.isFinite(notificationId)) throw new Error('Notifica non valida.');

    const { data: notification, error: notificationError } = await adminClient
      .from('app_notifications')
      .select('id, title, body, request_id, kind, created_by, recipient_user_id, push_status')
      .eq('id', notificationId)
      .single();
    if (notificationError || !notification) throw notificationError ?? new Error('Notifica non trovata.');
    if (notification.created_by !== authData.user.id && caller.role !== 'admin') {
      return response({ ok: false, error: 'Non puoi inviare una notifica creata da un altro utente.' }, 403);
    }
    if (caller.role !== 'admin') {
      if (notification.kind === 'system' && notification.recipient_user_id !== authData.user.id) {
        return response({ ok: false, error: 'Le notifiche di sistema globali sono riservate agli Admin.' }, 403);
      }
      if (notification.kind === 'reminder') {
        return response({ ok: false, error: 'I promemoria possono essere inviati soltanto dal sistema.' }, 403);
      }
      if (['request', 'status', 'assignment'].includes(notification.kind) && !notification.request_id) {
        return response({ ok: false, error: 'Notifica consegna priva di riferimento valido.' }, 403);
      }
    }

    let targetIds: string[] = [];
    if (notification.recipient_user_id) {
      const { data: target } = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', notification.recipient_user_id)
        .eq('active', true)
        .maybeSingle();
      if (target?.id) targetIds = [target.id];
    } else {
      const { data: activeProfiles, error: profilesError } = await adminClient.from('profiles').select('id').eq('active', true);
      if (profilesError) throw profilesError;
      targetIds = (activeProfiles ?? []).map((profile) => profile.id);
    }

    const targetProvider = String(body?.targetProvider ?? '');
    const targetKey = String(body?.targetKey ?? '').trim();
    const filter: PushTargetFilter = {};
    let ownedTargetId: number | null = null;
    if (targetProvider || targetKey) {
      if (!['expo', 'web'].includes(targetProvider) || !targetKey) throw new Error('Destinazione push di test non valida.');
      if (notification.recipient_user_id !== authData.user.id) {
        return response({ ok: false, error: 'Il test su dispositivo singolo è consentito soltanto sul proprio account.' }, 403);
      }
      const ownershipQuery = targetProvider === 'web'
        ? adminClient.from('web_push_subscriptions').select('id').eq('user_id', authData.user.id).eq('endpoint', targetKey).eq('active', true)
        : adminClient.from('push_tokens').select('id').eq('user_id', authData.user.id).eq('expo_push_token', targetKey).eq('active', true);
      const { data: ownedTarget, error: ownershipError } = await ownershipQuery.maybeSingle();
      if (ownershipError) throw ownershipError;
      if (!ownedTarget) {
        return response({ ok: false, error: 'Il dispositivo di test non appartiene all’utente corrente o non è attivo.' }, 403);
      }
      ownedTargetId = Number(ownedTarget.id);
      filter.provider = targetProvider as 'expo' | 'web';
      filter.key = targetKey;
    }

    const enqueueResult = await enqueuePushDeliveries(adminClient, notificationId, targetIds, filter);
    const dispatchResult = await dispatchPushNotification(adminClient, notificationId);
    const acceptedExpo = Number(dispatchResult.acceptedExpo ?? 0);
    const sentWeb = Number(dispatchResult.sentWeb ?? 0);
    const queued = Number(dispatchResult.retried ?? 0) > 0 || Number(dispatchResult.summary?.pending ?? 0) > 0;
    const totalAccepted = acceptedExpo + sentWeb;
    const noTargets = Number(dispatchResult.summary?.total ?? 0) === 0;
    let diagnostic: Record<string, unknown> | null = null;
    if (ownedTargetId && ['expo', 'web'].includes(targetProvider)) {
      const { data: deliveryDiagnostic } = await adminClient
        .from('push_deliveries')
        .select('status, attempts, last_status_code, last_error')
        .eq('notification_id', notificationId)
        .eq('provider', targetProvider)
        .eq('target_id', ownedTargetId)
        .maybeSingle();
      if (deliveryDiagnostic) {
        diagnostic = {
          status: deliveryDiagnostic.status,
          attempts: deliveryDiagnostic.attempts,
          statusCode: deliveryDiagnostic.last_status_code,
          error: String(deliveryDiagnostic.last_error ?? '').slice(0, 500),
        };
      }
    }

    const targetedTest = ownedTargetId !== null;
    const diagnosticText = diagnostic
      ? [
          diagnostic.status ? `stato ${String(diagnostic.status)}` : '',
          Number(diagnostic.statusCode ?? 0) ? `codice ${Number(diagnostic.statusCode)}` : '',
          String(diagnostic.error ?? '').trim(),
        ].filter(Boolean).join(' · ')
      : '';

    return response({
      ok: targetedTest ? totalAccepted > 0 : totalAccepted > 0 || queued,
      sent: totalAccepted,
      sentExpo: acceptedExpo,
      acceptedExpo,
      sentWeb,
      queued,
      noTargets,
      enqueued: enqueueResult.enqueued ?? 0,
      claimed: dispatchResult.claimed,
      retried: dispatchResult.retried,
      failed: dispatchResult.failed,
      invalid: dispatchResult.invalid,
      summary: dispatchResult.summary,
      diagnostic,
      error: noTargets
        ? 'Nessun dispositivo push attivo per il destinatario. Premi “Attiva su questo dispositivo”.'
        : targetedTest && totalAccepted === 0 && diagnosticText
          ? `Test push non consegnato: ${diagnosticText}`
          : targetedTest && totalAccepted === 0
            ? `Test push non consegnato. Accodate: ${Number(dispatchResult.retried ?? 0)} · fallite: ${Number(dispatchResult.failed ?? 0)} · non valide: ${Number(dispatchResult.invalid ?? 0)}.`
            : totalAccepted === 0 && queued
              ? 'Gateway temporaneamente non disponibile: invio accodato per un nuovo tentativo automatico.'
              : totalAccepted === 0
                ? 'La notifica non è stata accettata da alcun gateway push.'
                : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore interno.';
    return response({ ok: false, error: message }, 400);
  }
});
