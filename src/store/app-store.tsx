import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { statusLabels } from '@/lib/format';
import { cacheWebPushPublicKey, getConfiguredWebPushPublicKey, prepareWebPushServiceWorker, registerForPushNotificationsAsync, showDemoNotification, subscribeToNotificationActivity, subscribeToPushTokenRefresh, syncAppBadgeCount, type PushRegistrationResult } from '@/lib/notifications';
import {
  mapAdminStatistics,
  mapChatMessage,
  mapEquipment,
  mapNotification,
  mapRequest,
  mapSite,
  mapUser,
} from '@/lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type {
  AdminStatistics,
  AppNotification,
  AppUser,
  ChatMessage,
  CreateAppUserInput,
  DeliveryRequest,
  Equipment,
  LoginResult,
  NewDeliveryRequest,
  NotificationKind,
  PushAdminDiagnostics,
  PushRegistrationStatus,
  RequestStatus,
  SaveEquipmentInput,
  SaveSiteInput,
  Site,
  StatisticsFilters,
  UpdateAppUserInput,
  UserRole,
} from '@/types/domain';

const anonymousUser: AppUser = {
  id: 'anonymous',
  fullName: 'Utente',
  email: '',
  role: 'requester',
  active: false,
};

interface CreateUserResult {
  user?: AppUser;
  temporaryPassword?: string;
  error?: string;
}

interface ToggleResult {
  ok: boolean;
  error?: string;
  message?: string;
  mode?: 'deleted' | 'archived';
}

interface ResetPasswordResult {
  password?: string;
  error?: string;
}

interface AppStoreValue {
  ready: boolean;
  refreshing: boolean;
  isAuthenticated: boolean;
  isLiveMode: boolean;
  passwordRecovery: boolean;
  backendError?: string;
  activeRole: UserRole;
  currentUser: AppUser;
  requests: DeliveryRequest[];
  equipment: Equipment[];
  sites: Site[];
  users: AppUser[];
  notifications: AppNotification[];
  chatMessages: ChatMessage[];
  unreadNotifications: number;
  pushStatus: PushRegistrationStatus;
  demoPassword: string;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<LoginResult>;
  changeOwnPassword: (password: string) => Promise<LoginResult>;
  setActiveRole: (role: UserRole) => void;
  createUser: (input: CreateAppUserInput) => Promise<CreateUserResult>;
  updateUser: (input: UpdateAppUserInput) => Promise<ToggleResult>;
  deleteOrArchiveUser: (userId: string) => Promise<ToggleResult>;
  toggleUserActive: (userId: string) => Promise<ToggleResult>;
  resetUserPassword: (userId: string) => Promise<ResetPasswordResult>;
  createRequest: (input: NewDeliveryRequest) => Promise<DeliveryRequest | null>;
  deleteRequest: (requestId: string) => Promise<ToggleResult>;
  saveEquipment: (input: SaveEquipmentInput) => Promise<ToggleResult>;
  toggleEquipmentActive: (equipmentId: string) => Promise<ToggleResult>;
  saveSite: (input: SaveSiteInput) => Promise<ToggleResult>;
  toggleSiteActive: (siteId: string) => Promise<ToggleResult>;
  updateRequestStatus: (requestId: string, status: RequestStatus) => Promise<ToggleResult>;
  assignMover: (requestId: string, moverId: string) => Promise<ToggleResult>;
  takeRequest: (requestId: string, moverIds: string[]) => Promise<ToggleResult>;
  sendChatMessage: (text: string, requestId?: string, recipientId?: string) => Promise<ChatMessage | null>;
  deleteChatMessage: (messageId: string) => Promise<ToggleResult>;
  clearChatConversation: (requestId?: string, recipientId?: string) => Promise<ToggleResult>;
  clearAllChats: () => Promise<ToggleResult>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  createGlobalNotification: (kind: NotificationKind, title: string, body: string, requestId?: string, recipientUserId?: string) => Promise<void>;
  retryPushRegistration: () => Promise<void>;
  loadPushDiagnostics: () => Promise<{ data?: PushAdminDiagnostics; error?: string }>;
  sendPushTest: () => Promise<ToggleResult>;
  loadAdminStatistics: (filters: StatisticsFilters) => Promise<{ data?: AdminStatistics; error?: string }>;
  refreshAll: () => Promise<void>;
  resetDemo: () => Promise<void>;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

function errorMessage(error: unknown, fallback = 'Operazione non riuscita.') {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

function asRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return null;
}

export function AppStoreProvider({ children }: React.PropsWithChildren) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [refreshing, setRefreshing] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [backendError, setBackendError] = useState<string | undefined>(() => !isSupabaseConfigured
    ? 'Configurazione Supabase mancante. Su Vercel inserisci le variabili EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
    : undefined);
  const [currentUser, setCurrentUser] = useState<AppUser>(anonymousUser);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [requests, setRequests] = useState<DeliveryRequest[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pushStatus, setPushStatus] = useState<PushRegistrationStatus>({
    state: 'idle',
    message: Platform.OS === 'web' ? 'Web Push disponibile: attivala una volta per ricevere avvisi anche a browser chiuso.' : 'Registrazione notifiche non ancora verificata.',
  });

  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  const registeredPushRef = useRef<{ provider: 'expo' | 'web'; key: string } | undefined>(undefined);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    void prepareWebPushServiceWorker().catch(() => undefined);
  }, []);

  const loadDataForUser = useCallback(async (profile: AppUser) => {
    if (!supabase) return;
    setRefreshing(true);
    try {
      const userDirectoryPromise = profile.role === 'admin'
        ? supabase.rpc('list_admin_users')
        : supabase.rpc('list_user_directory');

      const [sitesResult, equipmentResult, requestsResult, usersResult, notificationsResult, readsResult, chatResult] = await Promise.all([
        supabase.from('sites').select('*').order('short_name'),
        supabase.from('equipment').select('*').order('name'),
        supabase.from('delivery_requests').select('*').order('requested_date', { ascending: false }).order('requested_time', { ascending: false }).limit(1000),
        userDirectoryPromise,
        supabase.from('app_notifications').select('*').order('created_at', { ascending: false }).limit(250),
        supabase.from('notification_reads').select('notification_id').eq('user_id', profile.id),
        supabase.from('chat_messages').select('*').order('created_at', { ascending: false }).limit(1000),
      ]);

      const firstError = [sitesResult.error, equipmentResult.error, requestsResult.error, usersResult.error, notificationsResult.error, readsResult.error, chatResult.error].find(Boolean);
      if (firstError) throw firstError;

      const readIds = new Set((readsResult.data ?? []).map((row) => String(row.notification_id)));
      const mappedUsers = ((usersResult.data ?? []) as Record<string, unknown>[]).map(mapUser);
      const withCurrent = mappedUsers.some((user) => user.id === profile.id)
        ? mappedUsers.map((user) => user.id === profile.id ? { ...user, email: profile.email, mustChangePassword: profile.mustChangePassword } : user)
        : [profile, ...mappedUsers];

      setSites(((sitesResult.data ?? []) as Record<string, unknown>[]).map(mapSite));
      setEquipment(((equipmentResult.data ?? []) as Record<string, unknown>[]).map(mapEquipment));
      setRequests(((requestsResult.data ?? []) as Record<string, unknown>[]).map(mapRequest));
      setUsers(withCurrent);
      setNotifications(((notificationsResult.data ?? []) as Record<string, unknown>[]).map((row) => mapNotification(row, profile.id, readIds)));
      setChatMessages(((chatResult.data ?? []) as Record<string, unknown>[]).map(mapChatMessage).sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
      setBackendError(undefined);
    } catch (error) {
      setBackendError(errorMessage(error, 'Impossibile leggere i dati da Supabase. Verifica la migrazione finale.'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadProfile = useCallback(async (userId: string, email = ''): Promise<AppUser | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    const profile = mapUser(data as Record<string, unknown>);
    profile.email = profile.email || email;
    return profile;
  }, []);

  const primeWebPush = useCallback(async () => {
    if (Platform.OS !== 'web' || !supabase) return;
    try {
      await prepareWebPushServiceWorker();
      const { data, error } = await supabase.functions.invoke('send-global-push', { body: { action: 'config' } });
      if (error) return;
      const serverPublicKey = String(data?.vapidPublicKey ?? '').replace(/\s+/g, '');
      if (serverPublicKey) cacheWebPushPublicKey(serverPublicKey);
    } catch {
      // La diagnostica visibile gestirà eventuali errori al momento dell'attivazione.
    }
  }, []);

  const registerNativeTokenOnServer = useCallback(async (result: PushRegistrationResult, updateVisibleStatus = true) => {
    if (!supabase || !result.token) throw new Error('Token push non disponibile.');
    const { data, error } = await supabase.functions.invoke('send-global-push', {
      body: {
        action: 'register_native',
        token: result.token,
        platform: Platform.OS,
        deviceName: result.deviceName,
      },
    });
    if (error || !data?.ok) throw new Error(String(data?.error ?? errorMessage(error, 'Token ottenuto ma non registrato sul server.')));

    registeredPushRef.current = { provider: 'expo', key: result.token };
    if (updateVisibleStatus) {
      setPushStatus({
        state: 'ready',
        message: `Notifiche push ${Platform.OS === 'android' ? 'Android' : 'iOS'} registrate correttamente su questo dispositivo.`,
        tokenPreview: `${result.token.slice(0, 18)}…${result.token.slice(-8)}`,
        lastAttemptAt: new Date().toISOString(),
      });
    }
  }, []);

  const registerPushToken = useCallback(async (_profile: AppUser, requestPermission = false) => {
    if (!supabase) return;
    setPushStatus({ state: 'checking', message: 'Verifica notifiche push in corso…', lastAttemptAt: new Date().toISOString() });

    // In avvio prepariamo Service Worker e chiave server. Sul tap, invece, il prompt
    // deve partire immediatamente senza attendere alcuna chiamata di rete.
    if (Platform.OS === 'web' && !requestPermission) await primeWebPush();
    const result = await registerForPushNotificationsAsync(requestPermission);
    if (!result.ok) {
      const permissionDenied = result.permission === 'denied';
      const state = result.permission === 'unsupported' || result.permission === 'install_required'
        ? 'unsupported'
        : permissionDenied
          ? 'permission_denied'
          : result.permission === 'prompt'
            ? 'idle'
            : 'error';
      setPushStatus({
        state,
        message: result.error ?? (Platform.OS === 'web'
          ? 'Apri la diagnostica push e attiva questo browser.'
          : 'Configurazione push non completata. Riprova dopo aver aggiornato l’app.'),
        lastAttemptAt: new Date().toISOString(),
      });
      return;
    }

    if (result.provider === 'web' && result.subscription) {
      const clientPublicKey = getConfiguredWebPushPublicKey();
      const { data: registrationData, error: registrationError } = await supabase.functions.invoke('send-global-push', {
        body: {
          action: 'register',
          clientPublicKey,
          subscription: result.subscription,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : result.deviceName,
        },
      });
      if (registrationError || !registrationData?.ok) {
        let serverError = String(registrationData?.error ?? '');
        const response = (registrationError as { context?: Response } | null)?.context;
        if (!serverError && response && typeof response.clone === 'function') {
          try {
            const payload = await response.clone().json() as { error?: string };
            serverError = String(payload.error ?? '');
          } catch {
            // Il messaggio generico Supabase resta disponibile come fallback.
          }
        }
        setPushStatus({
          state: 'error',
          message: serverError || errorMessage(registrationError, 'Permesso concesso, ma il dispositivo non è stato registrato sul server.'),
          lastAttemptAt: new Date().toISOString(),
        });
        return;
      }
      const serverPublicKey = String(registrationData.vapidPublicKey ?? '').replace(/\s+/g, '');
      if (serverPublicKey) cacheWebPushPublicKey(serverPublicKey);

      registeredPushRef.current = { provider: 'web', key: result.subscription.endpoint };
      setPushStatus({
        state: 'ready',
        message: 'Notifiche Web Push attive su questo dispositivo. Ora puoi usare anche “Invia test”.',
        tokenPreview: `${result.subscription.endpoint.slice(0, 28)}…${result.subscription.endpoint.slice(-12)}`,
        lastAttemptAt: new Date().toISOString(),
      });
      if (requestPermission) {
        await showDemoNotification('Marilab Mover', 'Notifiche attivate correttamente su questo dispositivo.').catch(() => undefined);
      }
      return;
    }

    try {
      await registerNativeTokenOnServer(result);
    } catch (error) {
      setPushStatus({
        state: 'error',
        message: errorMessage(error, 'Token ottenuto ma non registrato sul server.'),
        lastAttemptAt: new Date().toISOString(),
      });
    }
  }, [primeWebPush, registerNativeTokenOnServer]);

  const hydrateSession = useCallback(async (userId: string, email = '') => {
    try {
      const profile = await loadProfile(userId, email);
      if (!profile) throw new Error('Profilo non trovato.');
      if (!profile.active) {
        await supabase?.auth.signOut();
        throw new Error('Account disattivato. Contatta un amministratore.');
      }
      setCurrentUser(profile);
      setIsAuthenticated(true);
      await supabase?.from('profiles').update({ last_access_at: new Date().toISOString() }).eq('id', profile.id);
      await loadDataForUser(profile);
      void registerPushToken(profile, false);
    } catch (error) {
      setCurrentUser(anonymousUser);
      setIsAuthenticated(false);
      setBackendError(errorMessage(error, 'Profilo Marilab Mover non disponibile.'));
      throw error;
    }
  }, [loadDataForUser, loadProfile, registerPushToken]);

  useEffect(() => {
    let mounted = true;
    if (!isSupabaseConfigured || !supabase) return;

    supabase.auth.getSession()
      .then(async ({ data, error }) => {
        if (!mounted) return;
        if (error) throw error;
        const session = data.session;
        if (session?.user) await hydrateSession(session.user.id, session.user.email ?? '');
      })
      .catch((error) => mounted && setBackendError(errorMessage(error)))
      .finally(() => mounted && setReady(true));

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT' || !session?.user) {
        setIsAuthenticated(false);
        setPasswordRecovery(false);
        setCurrentUser(anonymousUser);
        setUsers([]);
        setRequests([]);
        setEquipment([]);
        setNotifications([]);
        setChatMessages([]);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        setTimeout(() => {
          void hydrateSession(session.user.id, session.user.email ?? '').catch((error) => setBackendError(errorMessage(error)));
        }, 0);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [hydrateSession]);

  const refreshAll = useCallback(async () => {
    const profile = currentUserRef.current;
    if (!profile.active || profile.id === 'anonymous') return;
    await loadDataForUser(profile);
  }, [loadDataForUser]);

  useEffect(() => {
    if (!supabase || !isAuthenticated || currentUser.id === 'anonymous') return;

    const refreshCurrentRegistration = () => {
      const profile = currentUserRef.current;
      if (!profile.active || profile.id === 'anonymous') return;
      void registerPushToken(profile, false);
    };

    const unsubscribeActivity = subscribeToNotificationActivity(() => {
      void refreshAll();
      if (Platform.OS === 'web') refreshCurrentRegistration();
    });
    const unsubscribeToken = subscribeToPushTokenRefresh((result) => {
      if (!result.ok || !result.token) return;
      void registerNativeTokenOnServer(result, false).catch((error) => {
        setBackendError(`Aggiornamento token push non riuscito: ${errorMessage(error)}`);
      });
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshCurrentRegistration();
    });
    const onlineHandler = () => refreshCurrentRegistration();
    if (Platform.OS === 'web' && typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('online', onlineHandler);
    }

    return () => {
      unsubscribeActivity();
      unsubscribeToken();
      appStateSubscription.remove();
      if (Platform.OS === 'web' && typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener('online', onlineHandler);
      }
    };
  }, [currentUser.id, isAuthenticated, refreshAll, registerNativeTokenOnServer, registerPushToken]);

  useEffect(() => {
    if (!supabase || !isAuthenticated || currentUser.id === 'anonymous') return;
    const client = supabase;
    const refresh = () => void refreshAll();
    const channel = client
      .channel(`marilab-mover-${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_requests' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_notifications' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads', filter: `user_id=eq.${currentUser.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refresh)
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [currentUser.id, isAuthenticated, refreshAll]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) return { ok: false, error: 'Inserisci email e password.' };
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    if (error || !data.user) {
      const translated = error?.message === 'Invalid login credentials'
        ? 'Email o password non corrette. Copia la password temporanea senza spazi.'
        : errorMessage(error);
      return { ok: false, error: translated };
    }
    try {
      await hydrateSession(data.user.id, data.user.email ?? normalized);
      return { ok: true };
    } catch (hydrateError) {
      return { ok: false, error: errorMessage(hydrateError) };
    }
  }, [hydrateSession]);

  const logout = useCallback(async () => {
    const registered = registeredPushRef.current;
    try {
      if (supabase && registered) {
        await supabase.functions.invoke('send-global-push', {
          body: { action: 'unregister', provider: registered.provider, key: registered.key },
        });
      }
    } finally {
      registeredPushRef.current = undefined;
      await supabase?.auth.signOut();
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<LoginResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    const normalized = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) return { ok: false, error: 'Inserisci prima un indirizzo email valido.' };
    const webOrigin = Platform.OS === 'web' && typeof globalThis.location !== 'undefined' ? globalThis.location.origin : undefined;
    const redirectTo = webOrigin ? `${webOrigin}/` : Linking.createURL('/');
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, { redirectTo });
    if (error) return { ok: false, error: errorMessage(error) };
    return { ok: true };
  }, []);

  const changeOwnPassword = useCallback(async (password: string): Promise<LoginResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    if (password.length < 8) return { ok: false, error: 'Usa almeno 8 caratteri.' };
    const { error: authError } = await supabase.auth.updateUser({ password });
    if (authError) return { ok: false, error: errorMessage(authError) };
    const { error: profileError } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', currentUser.id);
    if (profileError) return { ok: false, error: errorMessage(profileError) };
    const updated = { ...currentUser, mustChangePassword: false };
    setCurrentUser(updated);
    setUsers((items) => items.map((item) => item.id === updated.id ? updated : item));
    setPasswordRecovery(false);
    return { ok: true };
  }, [currentUser]);

  const invokeAdminFunction = useCallback(async (body: Record<string, unknown>) => {
    if (!supabase) throw new Error('Supabase non configurato.');
    const { data, error } = await supabase.functions.invoke('admin-manage-user', { body });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data as Record<string, unknown>;
  }, []);

  const createUser = useCallback(async (input: CreateAppUserInput): Promise<CreateUserResult> => {
    try {
      const result = await invokeAdminFunction({ action: 'create', ...input });
      const row = asRow(result.user);
      if (!row) throw new Error('Risposta utente non valida.');
      const user = mapUser(row);
      await refreshAll();
      return { user, temporaryPassword: String(result.temporaryPassword ?? '') };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [invokeAdminFunction, refreshAll]);

  const updateUser = useCallback(async (input: UpdateAppUserInput): Promise<ToggleResult> => {
    try {
      await invokeAdminFunction({ action: 'update', userId: input.id, ...input });
      await refreshAll();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }, [invokeAdminFunction, refreshAll]);

  const deleteOrArchiveUser = useCallback(async (userId: string): Promise<ToggleResult> => {
    if (userId === currentUser.id) return { ok: false, error: 'Non puoi eliminare il tuo account Admin.' };
    try {
      const result = await invokeAdminFunction({ action: 'delete', userId });
      await refreshAll();
      return { ok: true, mode: result.mode === 'deleted' ? 'deleted' : 'archived' };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }, [currentUser.id, invokeAdminFunction, refreshAll]);

  const toggleUserActive = useCallback(async (userId: string): Promise<ToggleResult> => {
    if (userId === currentUser.id) return { ok: false, error: 'Non puoi disattivare il tuo account.' };
    const target = users.find((user) => user.id === userId);
    if (!target) return { ok: false, error: 'Utente non trovato.' };
    try {
      await invokeAdminFunction({ action: 'set_active', userId, active: !target.active });
      await refreshAll();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }, [currentUser.id, invokeAdminFunction, refreshAll, users]);

  const resetUserPassword = useCallback(async (userId: string): Promise<ResetPasswordResult> => {
    try {
      const result = await invokeAdminFunction({ action: 'reset_password', userId });
      await refreshAll();
      return { password: String(result.temporaryPassword ?? '') };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [invokeAdminFunction, refreshAll]);

  const sendPushForNotification = useCallback(async (
    notificationId: string | number | null,
    target?: { provider: 'expo' | 'web'; key: string },
  ) => {
    if (!supabase || notificationId == null) throw new Error('Notifica non disponibile.');
    const { data, error } = await supabase.functions.invoke('send-global-push', {
      body: {
        notificationId,
        targetProvider: target?.provider,
        targetKey: target?.key,
      },
    });
    if (error) throw error;
    if (data?.ok === false) throw new Error(String(data.error ?? 'Invio push non riuscito.'));
    return (data ?? {}) as Record<string, unknown>;
  }, []);

  const createGlobalNotification = useCallback(async (
    kind: NotificationKind,
    title: string,
    body: string,
    requestId?: string,
    recipientUserId?: string,
  ) => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('create_app_notification', {
      p_kind: kind,
      p_title: title,
      p_body: body,
      p_request_id: requestId ?? null,
      p_recipient_user_id: recipientUserId ?? null,
    });
    if (error) throw error;
    try {
      await sendPushForNotification(data as string | number | null);
    } catch (pushError) {
      setBackendError(`Notifica salvata, ma push non inviata: ${errorMessage(pushError)}`);
    }
  }, [sendPushForNotification]);

  const createRequest = useCallback(async (input: NewDeliveryRequest): Promise<DeliveryRequest | null> => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.rpc('create_delivery_request', {
        p_equipment_id: input.equipmentId,
        p_pickup_site_id: input.pickupSiteId,
        p_destination_site_id: input.destinationSiteId,
        p_requested_date: input.requestedDate,
        p_requested_time: input.requestedTime,
        p_priority: input.priority,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      const row = asRow(data);
      if (!row) throw new Error('Richiesta non restituita dal database.');
      const created = mapRequest(row);
      const item = equipment.find((entry) => entry.id === created.equipmentId);
      const destination = sites.find((entry) => entry.id === created.destinationSiteId);
      await createGlobalNotification('request', `Nuova richiesta ${created.code}`, `${item?.name ?? 'Apparecchiatura'} richiesta per ${destination?.shortName ?? 'la destinazione'} alle ${created.requestedTime}.`, created.id);
      await refreshAll();
      return created;
    } catch (error) {
      setBackendError(errorMessage(error));
      return null;
    }
  }, [createGlobalNotification, equipment, refreshAll, sites]);

  const deleteRequest = useCallback(async (requestId: string): Promise<ToggleResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    if (currentUser.role !== 'admin') return { ok: false, error: 'Funzione riservata agli Admin.' };
    const target = requests.find((entry) => entry.id === requestId);
    if (!target) return { ok: false, error: 'Richiesta o consegna non trovata.' };
    const { error } = await supabase.rpc('admin_delete_delivery_request', { p_request_id: requestId });
    if (error) return { ok: false, error: errorMessage(error) };
    await refreshAll();
    return { ok: true, mode: 'deleted' };
  }, [currentUser.role, refreshAll, requests]);

  const saveEquipment = useCallback(async (input: SaveEquipmentInput): Promise<ToggleResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    if (currentUser.role !== 'admin') return { ok: false, error: 'Funzione riservata agli Admin.' };
    const payload = {
      inventory_code: input.inventoryCode.trim().toUpperCase(),
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      model: input.model?.trim() || null,
      serial_number: input.serialNumber?.trim() || null,
      home_site_id: input.homeSiteId,
      current_site_id: input.currentSiteId,
      movable: input.movable,
      active: input.active,
      accessories: input.accessories.map((item) => item.trim()).filter(Boolean),
      notes: input.notes?.trim() || null,
    };
    if (!payload.inventory_code || !payload.name || !payload.home_site_id || !payload.current_site_id) return { ok: false, error: 'Compila codice, nome e sedi.' };
    try {
      const operation = input.id ? supabase.from('equipment').update(payload).eq('id', input.id) : supabase.from('equipment').insert(payload);
      const { error } = await operation;
      if (error) throw error;
      await createGlobalNotification('system', input.id ? 'Strumento aggiornato' : 'Nuovo strumento disponibile', `${payload.name} · ${payload.inventory_code}`);
      await refreshAll();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }, [createGlobalNotification, currentUser.role, refreshAll]);

  const toggleEquipmentActive = useCallback(async (equipmentId: string): Promise<ToggleResult> => {
    const item = equipment.find((entry) => entry.id === equipmentId);
    if (!item) return { ok: false, error: 'Strumento non trovato.' };
    return saveEquipment({
      id: item.id,
      inventoryCode: item.inventoryCode,
      name: item.name,
      brand: item.brand,
      model: item.model,
      serialNumber: item.serialNumber,
      homeSiteId: item.homeSiteId,
      currentSiteId: item.currentSiteId,
      movable: item.movable,
      active: !item.active,
      accessories: item.accessories,
      notes: item.notes,
    });
  }, [equipment, saveEquipment]);

  const saveSite = useCallback(async (input: SaveSiteInput): Promise<ToggleResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    if (currentUser.role !== 'admin') return { ok: false, error: 'Funzione riservata agli Admin.' };
    const payload = {
      name: input.name.trim(),
      short_name: input.shortName.trim(),
      address: input.address.trim(),
      maps_query: input.mapsQuery?.trim() || input.address.trim(),
      contact_name: input.contactName?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      active: input.active,
    };
    if (!payload.name || !payload.short_name || !payload.address) return { ok: false, error: 'Compila nome, nome breve e indirizzo.' };
    try {
      const operation = input.id ? supabase.from('sites').update(payload).eq('id', input.id) : supabase.from('sites').insert(payload);
      const { error } = await operation;
      if (error) throw error;
      await createGlobalNotification('system', input.id ? 'Sede aggiornata' : 'Nuova sede inserita', `${payload.short_name} · ${payload.address}`);
      await refreshAll();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }, [createGlobalNotification, currentUser.role, refreshAll]);

  const toggleSiteActive = useCallback(async (siteId: string): Promise<ToggleResult> => {
    const site = sites.find((entry) => entry.id === siteId);
    if (!site) return { ok: false, error: 'Sede non trovata.' };
    return saveSite({
      id: site.id,
      name: site.name,
      shortName: site.shortName,
      address: site.address,
      mapsQuery: site.mapsQuery,
      contactName: site.contactName,
      contactPhone: site.contactPhone,
      active: !site.active,
    });
  }, [saveSite, sites]);

  const updateRequestStatus = useCallback(async (requestId: string, status: RequestStatus): Promise<ToggleResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    try {
      const { error } = await supabase.rpc('update_delivery_status', { p_request_id: requestId, p_status: status });
      if (error) throw error;
      const request = requests.find((entry) => entry.id === requestId);
      const item = equipment.find((entry) => entry.id === request?.equipmentId);
      await createGlobalNotification('status', `${request?.code ?? 'Consegna'} aggiornata`, `${item?.name ?? 'Apparecchiatura'}: ${statusLabels[status]} · aggiornato da ${currentUser.fullName}.`, requestId);
      await refreshAll();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }, [createGlobalNotification, currentUser.fullName, equipment, refreshAll, requests]);

  const assignMover = useCallback(async (requestId: string, moverId: string): Promise<ToggleResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    try {
      const { error } = await supabase.rpc('assign_delivery_mover', { p_request_id: requestId, p_mover_id: moverId });
      if (error) throw error;
      const request = requests.find((entry) => entry.id === requestId);
      const mover = users.find((entry) => entry.id === moverId);
      await createGlobalNotification('assignment', `${request?.code ?? 'Consegna'} assegnata`, `Consegna assegnata a ${mover?.fullName ?? 'un Mover'}.`, requestId);
      await refreshAll();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }, [createGlobalNotification, refreshAll, requests, users]);

  const takeRequest = useCallback(async (requestId: string, moverIds: string[]): Promise<ToggleResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    const uniqueMoverIds = [...new Set(moverIds.filter(Boolean))];
    if (!uniqueMoverIds.length) return { ok: false, error: 'Seleziona almeno un Mover.' };
    try {
      const { error } = await supabase.rpc('take_delivery_request', { p_request_id: requestId, p_mover_ids: uniqueMoverIds });
      if (error) throw error;
      const request = requests.find((entry) => entry.id === requestId);
      const item = equipment.find((entry) => entry.id === request?.equipmentId);
      const names = uniqueMoverIds.map((id) => users.find((entry) => entry.id === id)?.fullName).filter(Boolean).join(' e ');
      const note = request?.note?.trim();
      await createGlobalNotification('assignment', `${request?.code ?? 'Consegna'} presa in carico`, `${names || 'Mover'} si sta muovendo per ${item?.name ?? 'l’apparecchiatura'}.${note ? ` Nota: ${note}` : ''}`, requestId);
      await refreshAll();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }, [createGlobalNotification, equipment, refreshAll, requests, users]);

  const sendChatMessage = useCallback(async (value: string, requestId?: string, recipientId?: string): Promise<ChatMessage | null> => {
    if (!supabase) return null;
    const cleanText = value.trim().slice(0, 1000);
    if (!cleanText) return null;
    if (recipientId === currentUser.id) return null;
    try {
      const { data, error } = await supabase.from('chat_messages').insert({
        sender_id: currentUser.id,
        request_id: requestId ?? null,
        recipient_id: recipientId ?? null,
        message: cleanText,
      }).select('*').single();
      if (error) throw error;

      const created = mapChatMessage(data as Record<string, unknown>);
      setChatMessages((items) => items.some((item) => item.id === created.id)
        ? items
        : [...items, created].sort((left, right) => left.createdAt.localeCompare(right.createdAt)));

      const request = requests.find((entry) => entry.id === requestId);
      const title = recipientId
        ? `Messaggio privato da ${currentUser.fullName}`
        : request ? `Nuovo messaggio su ${request.code}` : 'Nuovo messaggio nella chat generale';
      const body = recipientId ? cleanText.slice(0, 120) : `${currentUser.fullName}: ${cleanText.slice(0, 120)}`;

      try {
        await createGlobalNotification('chat', title, body, requestId, recipientId);
      } catch (notificationError) {
        setBackendError(`Messaggio inviato, ma notifica non creata: ${errorMessage(notificationError)}`);
      }

      await refreshAll();
      return created;
    } catch (error) {
      setBackendError(errorMessage(error));
      return null;
    }
  }, [createGlobalNotification, currentUser.fullName, currentUser.id, refreshAll, requests]);

  const deleteChatMessage = useCallback(async (messageId: string): Promise<ToggleResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    if (currentUser.role !== 'admin') return { ok: false, error: 'Solo un Admin può eliminare i messaggi.' };
    const { error } = await supabase.rpc('delete_chat_message', { p_message_id: Number(messageId) });
    if (error) return { ok: false, error: errorMessage(error) };
    await refreshAll();
    return { ok: true };
  }, [currentUser.role, refreshAll]);

  const clearChatConversation = useCallback(async (requestId?: string, recipientId?: string): Promise<ToggleResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    if (currentUser.role !== 'admin') return { ok: false, error: 'Solo un Admin può svuotare una conversazione.' };
    const { error } = await supabase.rpc('admin_clear_chat_conversation', {
      p_request_id: requestId ?? null,
      p_other_user_id: recipientId ?? null,
    });
    if (error) return { ok: false, error: errorMessage(error) };
    await refreshAll();
    return { ok: true };
  }, [currentUser.role, refreshAll]);


  const clearAllChats = useCallback(async (): Promise<ToggleResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    if (currentUser.role !== 'admin') return { ok: false, error: 'Solo un Admin può eliminare tutte le chat.' };
    const { data, error } = await supabase.rpc('admin_clear_all_chats');
    if (error) return { ok: false, error: errorMessage(error) };
    const result = (data ?? {}) as Record<string, unknown>;
    await refreshAll();
    return {
      ok: true,
      message: `${Number(result.deleted_messages ?? 0)} messaggi e ${Number(result.deleted_notifications ?? 0)} notifiche chat eliminati.`,
    };
  }, [currentUser.role, refreshAll]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    if (!supabase) return;
    await supabase.from('notification_reads').upsert({ notification_id: Number(notificationId), user_id: currentUser.id }, { onConflict: 'notification_id,user_id' });
    setNotifications((items) => items.map((item) => item.id === notificationId ? { ...item, readBy: [currentUser.id] } : item));
  }, [currentUser.id]);

  const markAllNotificationsRead = useCallback(async () => {
    if (!supabase) return;
    const unread = notifications.filter((item) => !item.readBy.includes(currentUser.id));
    if (!unread.length) return;
    await supabase.from('notification_reads').upsert(unread.map((item) => ({ notification_id: Number(item.id), user_id: currentUser.id })), { onConflict: 'notification_id,user_id' });
    setNotifications((items) => items.map((item) => ({ ...item, readBy: [currentUser.id] })));
  }, [currentUser.id, notifications]);

  const retryPushRegistration = useCallback(async () => {
    if (currentUser.id === 'anonymous') return;
    await registerPushToken(currentUser, true);
  }, [currentUser, registerPushToken]);

  const loadPushDiagnostics = useCallback(async () => {
    if (!supabase) return { error: 'Supabase non configurato.' };
    if (currentUser.role !== 'admin') return { error: 'Funzione riservata agli Admin.' };
    const { data, error } = await supabase.rpc('admin_push_diagnostics');
    if (error) return { error: errorMessage(error) };
    const row = (data ?? {}) as Record<string, unknown>;
    const usersWithoutToken = Array.isArray(row.users_without_token)
      ? row.users_without_token.map((item) => {
          const user = item as Record<string, unknown>;
          return { id: String(user.id ?? ''), fullName: String(user.full_name ?? ''), email: String(user.email ?? '') };
        })
      : [];
    return { data: { activeUsers: Number(row.active_users ?? 0), activeTokens: Number(row.active_tokens ?? 0), nativeTokens: Number(row.native_tokens ?? 0), webSubscriptions: Number(row.web_subscriptions ?? 0), pendingDeliveries: Number(row.pending_deliveries ?? 0), failedDeliveries24h: Number(row.failed_deliveries_24h ?? 0), usersWithoutToken } };
  }, [currentUser.role]);

  const sendPushTest = useCallback(async (): Promise<ToggleResult> => {
    if (!supabase) return { ok: false, error: 'Supabase non configurato.' };
    try {
      const { data: notificationId, error: createError } = await supabase.rpc('create_app_notification', {
        p_kind: 'system',
        p_title: 'Test notifiche Marilab Mover',
        p_body: 'Se leggi questo messaggio, le notifiche push del dispositivo sono operative.',
        p_request_id: null,
        p_recipient_user_id: currentUser.id,
      });
      if (createError) throw createError;
      const registered = registeredPushRef.current;
      if (!registered) throw new Error('Questo dispositivo non risulta registrato. Premi prima “Attiva su questo dispositivo”.');
      const result = await sendPushForNotification(notificationId as string | number | null, registered);
      const sentWeb = Number(result.sentWeb ?? 0);
      const acceptedExpo = Number(result.acceptedExpo ?? result.sentExpo ?? 0);
      if (Platform.OS === 'web' && sentWeb < 1) throw new Error('Il test non è stato accettato dal gateway del browser/PWA corrente. Premi di nuovo “Attiva su questo dispositivo”.');
      if (Platform.OS !== 'web' && acceptedExpo < 1) throw new Error('Il test non è stato accettato dal gateway Expo per questo telefono. Controlla credenziali FCM/APNs e riprova.');
      return {
        ok: true,
        message: Platform.OS === 'web'
          ? 'Test Web Push accettato dal gateway del browser corrente.'
          : 'Test push accettato dal gateway Expo per questo telefono; la ricevuta definitiva verrà verificata automaticamente.',
      };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }, [currentUser.id, sendPushForNotification]);

  const loadAdminStatistics = useCallback(async (filters: StatisticsFilters) => {
    if (!supabase) return { error: 'Supabase non configurato.' };
    if (currentUser.role !== 'admin') return { error: 'Le statistiche sono riservate agli Admin.' };
    const { data, error } = await supabase.rpc('admin_delivery_statistics', {
      p_from_date: filters.fromDate ?? null,
      p_to_date: filters.toDate ?? null,
      p_site_id: filters.siteId ?? null,
      p_equipment_id: filters.equipmentId ?? null,
      p_mover_id: filters.moverId ?? null,
      p_status: filters.status ?? null,
      p_priority: filters.priority ?? null,
    });
    if (error) return { error: errorMessage(error) };
    return { data: mapAdminStatistics(data) };
  }, [currentUser.role]);

  const setActiveRole = useCallback((_role: UserRole) => {
    // Il ruolo è assegnato dall'Admin e non è selezionabile dall'utente.
  }, []);

  const resetDemo = useCallback(async () => {
    await refreshAll();
  }, [refreshAll]);

  const unreadNotifications = notifications.filter((item) => !item.readBy.includes(currentUser.id)).length;

  useEffect(() => {
    void syncAppBadgeCount(isAuthenticated ? unreadNotifications : 0);
  }, [isAuthenticated, unreadNotifications]);

  const value = useMemo<AppStoreValue>(() => ({
    ready,
    refreshing,
    isAuthenticated,
    isLiveMode: isSupabaseConfigured,
    passwordRecovery,
    backendError,
    activeRole: currentUser.role,
    currentUser,
    requests,
    equipment,
    sites,
    users,
    notifications,
    chatMessages,
    unreadNotifications,
    pushStatus,
    demoPassword: '',
    login,
    logout,
    requestPasswordReset,
    changeOwnPassword,
    setActiveRole,
    createUser,
    updateUser,
    deleteOrArchiveUser,
    toggleUserActive,
    resetUserPassword,
    createRequest,
    deleteRequest,
    saveEquipment,
    toggleEquipmentActive,
    saveSite,
    toggleSiteActive,
    updateRequestStatus,
    assignMover,
    takeRequest,
    sendChatMessage,
    deleteChatMessage,
    clearChatConversation,
    clearAllChats,
    markNotificationRead,
    markAllNotificationsRead,
    createGlobalNotification,
    retryPushRegistration,
    loadPushDiagnostics,
    sendPushTest,
    loadAdminStatistics,
    refreshAll,
    resetDemo,
  }), [
    ready,
    refreshing,
    isAuthenticated,
    passwordRecovery,
    backendError,
    currentUser,
    requests,
    equipment,
    sites,
    users,
    notifications,
    chatMessages,
    unreadNotifications,
    pushStatus,
    login,
    logout,
    requestPasswordReset,
    changeOwnPassword,
    setActiveRole,
    createUser,
    updateUser,
    deleteOrArchiveUser,
    toggleUserActive,
    resetUserPassword,
    createRequest,
    deleteRequest,
    saveEquipment,
    toggleEquipmentActive,
    saveSite,
    toggleSiteActive,
    updateRequestStatus,
    assignMover,
    takeRequest,
    sendChatMessage,
    deleteChatMessage,
    clearChatConversation,
    clearAllChats,
    markNotificationRead,
    markAllNotificationsRead,
    createGlobalNotification,
    retryPushRegistration,
    loadPushDiagnostics,
    sendPushTest,
    loadAdminStatistics,
    refreshAll,
    resetDemo,
  ]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore deve essere usato dentro AppStoreProvider');
  return store;
}
