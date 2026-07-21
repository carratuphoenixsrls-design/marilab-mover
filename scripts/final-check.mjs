import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const passed = [];

function check(name, condition, detail = '') {
  if (condition) passed.push(name);
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}
function filePath(file) { return path.join(root, file); }
function text(file) { return fs.readFileSync(filePath(file), 'utf8'); }
function exists(file) { return fs.existsSync(filePath(file)); }
function filesUnder(directory, extensions = ['.ts', '.tsx', '.js', '.mjs', '.json', '.sql', '.md', '.txt', '.bat']) {
  const result = [];
  if (!exists(directory)) return result;
  for (const entry of fs.readdirSync(filePath(directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(relative, extensions));
    else if (extensions.includes(path.extname(entry.name).toLowerCase())) result.push(relative);
  }
  return result;
}

const pkg = JSON.parse(text('package.json'));
const lock = JSON.parse(text('package-lock.json'));
const app = JSON.parse(text('app.json'));
const vercel = JSON.parse(text('vercel.json'));
const manifest = JSON.parse(text('public/manifest.json'));
const store = text('src/store/app-store.tsx');
const shell = text('src/components/app-shell.tsx');
const auth = text('src/components/auth-screen.tsx');
const users = text('src/components/user-management.tsx');
const adminMaster = text('src/components/admin-master-data.tsx');
const html = text('src/app/+html.tsx');
const sw = text('public/sw.js');
const pwaPatch = text('scripts/patch-web-pwa.mjs');
const migration = text('supabase/MIGRAZIONE_E1_3_0_FINALE.sql');
const webMigration = text('supabase/MIGRAZIONE_E1_6_0_FASE3_WEB_PUSH.sql');
const reliabilityMigration = text('supabase/MIGRAZIONE_E1_6_9_PUSH_RELIABILITY.sql');
const adminControlMigration = text('supabase/MIGRAZIONE_E1_8_1_ADMIN_CONTROL_CHAT_FIX.sql');
const adminFn = text('supabase/functions/admin-manage-user/index.ts');
const pushFn = text('supabase/functions/send-global-push/index.ts');
const webPushShared = text('supabase/functions/_shared/web-push.ts');
const pushDispatch = text('supabase/functions/_shared/push-dispatch.ts');
const remindersFn = text('supabase/functions/scheduled-reminders/index.ts');
const webNotifications = text('src/lib/notifications.web.ts');
const nativeNotifications = text('src/lib/notifications.ts');
const sourceBundle = filesUnder('src').map(text).join('\n') + filesUnder('supabase/functions').map(text).join('\n');

const sqlBundle = filesUnder('supabase', ['.sql']).map(text).join('\n');
const rpcCalls = [...new Set([...sourceBundle.matchAll(/\.rpc\(['"]([^'"]+)/g)].map((match) => match[1]))];
const tableCalls = [...new Set([...sourceBundle.matchAll(/\.from\(['"]([^'"]+)/g)].map((match) => match[1]))];
const missingRpcs = rpcCalls.filter((name) => !new RegExp(`\\b(?:function|procedure)\\s+(?:public\\.)?${name}\\b`, 'i').test(sqlBundle));
const missingTables = tableCalls.filter((name) => !new RegExp(`\\bcreate\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${name}\\b`, 'i').test(sqlBundle));

check('Versione package 1.8.2', pkg.version === '1.8.2');
check('Versione lock 1.8.2', lock.version === '1.8.2' && lock.packages?.['']?.version === '1.8.2');
check('Versione Expo 1.8.2', app.expo.version === '1.8.2');
check('Android versionCode 19', app.expo.android?.versionCode === 19);
check('Package Android stabile', app.expo.android?.package === 'it.marilab.mover');
check('Bundle iOS stabile', app.expo.ios?.bundleIdentifier === 'it.marilab.mover');
check('Permesso Android 13 corretto', Array.isArray(app.expo.android?.permissions) && app.expo.android.permissions.includes('POST_NOTIFICATIONS') && !app.expo.android.permissions.includes('NOTIFICATIONS'));
check('Firebase Android collegato', app.expo.android?.googleServicesFile === './google-services.json' && exists('google-services.json'));
check('EAS project collegato', app.expo.extra?.eas?.projectId === '60570208-f4ac-486f-a133-916a11ec42b5');
check('Autore ufficiale Fabio Carratù', pkg.author === 'Fabio Carratù' && app.expo.extra?.author === 'Fabio Carratù');
check('Node LTS vincolato', pkg.engines?.node === '>=20 <23');
check('Typecheck configurato', pkg.scripts?.typecheck === 'tsc --noEmit');
check('Lint configurato', pkg.scripts?.lint === 'expo lint');
check('Build web configurata', pkg.scripts?.build === 'expo export --platform web --max-workers 2 && node scripts/patch-web-pwa.mjs');
check('Simulazione Push configurata', pkg.scripts?.['verify:push'] === 'node scripts/push-reliability-simulation.mjs' && exists('scripts/push-reliability-simulation.mjs'));
check('Check completo configurato', pkg.scripts?.check?.includes('lint') && pkg.scripts?.check?.includes('typecheck') && pkg.scripts?.check?.includes('verify:final') && pkg.scripts?.check?.includes('verify:push') && pkg.scripts?.check?.includes('build'));

check('Vercel install riproducibile', vercel.installCommand === 'npm ci --no-audit --no-fund');
check('Vercel output dist', vercel.outputDirectory === 'dist');
check('Vercel SPA rewrite', Array.isArray(vercel.rewrites) && vercel.rewrites.some((item) => item.destination === '/index.html'));
check('Header Service Worker senza cache obsoleta', JSON.stringify(vercel.headers).includes('must-revalidate') && JSON.stringify(vercel.headers).includes('Service-Worker-Allowed'));
check('Nessun index HTML che sovrascrive Expo', !exists('public/index.html'));

check('Manifest PWA 1.8.2', manifest.description?.includes('1.8.2'));
check('Manifest standalone', manifest.display === 'standalone' && manifest.start_url === '/' && manifest.scope === '/');
check('Icone PWA complete', exists('public/icon-192.png') && exists('public/icon-512.png') && exists('public/apple-touch-icon.png'));
check('Service Worker 1.8.2', sw.includes("marilab-mover-shell-v1.8.2"));
check('Service Worker gestisce push', sw.includes("addEventListener('push'") && sw.includes('showNotification'));
check('Service Worker gestisce click', sw.includes("addEventListener('notificationclick'") && sw.includes('openWindow'));
check('Service Worker navigazione network-first', sw.includes("event.request.mode === 'navigate'") && sw.includes('fetch(event.request)'));

check('Viewport browser full-screen', html.includes('height: 100%') && html.includes('min-height: 100dvh') && html.includes('overflow: hidden'));
check('Root web flessibile', html.includes('#root { display: flex; min-width: 0; min-height: 0; }'));
check('Desktop HD attivo da 1100 px', shell.includes("width >= 1100") && html.includes('@media (min-width: 1100px)'));
check('Sidebar desktop 280 px', shell.includes('desktopSidebar: { width: 280'));
check('Sidebar desktop con scroll indipendente', shell.includes('desktopSidebarScroll') && shell.includes('showsVerticalScrollIndicator'));
check('Contenuto desktop usa tutto lo spazio', shell.includes('desktopContent: { flex: 1') && shell.includes('overflow: \'hidden\''));
check('Pagine con scroll full-height', shell.includes('screenScroller: { flex: 1') && shell.includes('minHeight: 0'));
check('Griglie responsive HD', shell.includes('function ResponsiveGrid') && shell.includes('maxColumns') && shell.includes("calc("));
check('Consegne responsive fino a 3 colonne', shell.includes('<ResponsiveGrid minColumnWidth={500} maxColumns={3}>'));
check('Inventario responsive fino a 3 colonne', shell.includes('<ResponsiveGrid minColumnWidth={430} maxColumns={3}>'));
check('Utenti responsive su desktop', users.includes('userGridDesktop') && users.includes('maxWidth: Platform.OS === \'web\' ? 1560'));
check('Master data ampio su web', adminMaster.includes("maxWidth: Platform.OS === 'web' ? 1440"));
check('Login HD 1580 px', auth.includes('maxWidth: 1580') && auth.includes('Enterprise 1.8.2'));
check('Modal statistiche HD', shell.includes("statisticsScroll: { padding") && shell.includes("Platform.OS === 'web' ? 1560"));
check('Chat e notifiche HD', shell.includes("chatList: { flexGrow") && shell.includes("notificationList: { padding") && shell.includes("Platform.OS === 'web' ? 1400"));

check('Web Push browser implementato', exists('src/lib/notifications.web.ts') && exists('public/sw.js'));
check('Fallback chiave pubblica Web Push', webNotifications.includes('DEFAULT_WEB_PUSH_VAPID_PUBLIC_KEY'));
check('Chiave server memorizzata in cache locale', webNotifications.includes('SERVER_VAPID_STORAGE_KEY') && webNotifications.includes('cacheWebPushPublicKey'));
check('Service Worker preparato prima del prompt', webNotifications.indexOf('const registrationPromise = prepareWebPushServiceWorker()') >= 0 && webNotifications.indexOf('const registrationPromise = prepareWebPushServiceWorker()') < webNotifications.indexOf('Notification.requestPermission()'));
check('Prompt direttamente dal tap', store.includes('registerPushToken(currentUser, true)') && store.indexOf('registerForPushNotificationsAsync(requestPermission)') < store.indexOf("action: 'register'"));
check('iPhone richiede PWA Home', webNotifications.includes('isStandaloneWebApp') && webNotifications.includes('aggiungi Marilab Mover alla schermata Home'));
check('Rinnovo sottoscrizione solo con VAPID cambiata', webNotifications.includes('vapidKeyChanged') && webNotifications.includes('subscription.unsubscribe'));
check('Sottoscrizione Web Push completa', webNotifications.includes('json.keys?.p256dh') && webNotifications.includes('json.keys?.auth'));
check('Registrazione browser demandata al server', store.includes("action: 'register'") && !store.includes("from('web_push_subscriptions').upsert"));
check('Edge Function registra endpoint', pushFn.includes("action === 'register'") && pushFn.includes("onConflict: 'endpoint'"));
check('Edge Function trasferisce endpoint all’utente autenticato', pushFn.includes('user_id: authData.user.id'));
check('Edge Function verifica coerenza VAPID', pushFn.includes('clientPublicKey !== publicKey'));
check('Configurazione push leggibile dal client autenticato', pushFn.includes("action === 'config'") && pushFn.includes('vapidPublicKey'));
check('Conferma locale dopo attivazione', store.includes("showDemoNotification('Marilab Mover'"));
check('Messaggi diagnostici server mostrati', store.includes('response.clone().json()') && store.includes('serverError'));
check('Stub nativo allineato alle API Web', nativeNotifications.includes('cacheWebPushPublicKey') && nativeNotifications.includes('prepareWebPushServiceWorker'));
check('Invio Web Push firmato VAPID', webPushShared.includes('WEB_PUSH_VAPID_PRIVATE_KEY') && webPushShared.includes('setVapidDetails'));
check('Gestione sottoscrizioni scadute', pushDispatch.includes('deactivateTarget') && webPushShared.includes("return 'invalid'") && webPushShared.includes("return 'refresh'"));
check('Test push sul dispositivo corrente', store.includes('registeredPushRef.current') && store.includes('targetProvider') && pushFn.includes('targetProvider') && pushFn.includes('targetKey'));
check('Test push vincolato al proprietario del dispositivo', pushFn.includes('notification.recipient_user_id !== authData.user.id') && pushFn.includes('Il dispositivo di test non appartiene'));
check('Broadcast di sistema riservato agli Admin', reliabilityMigration.includes('Le notifiche di sistema globali sono riservate agli Admin') && pushFn.includes("caller.role !== 'admin'"));
check('Notifiche collegate ad azioni reali', reliabilityMigration.includes("p_kind in ('status', 'assignment')") && reliabilityMigration.includes('request_events') && reliabilityMigration.includes('chat_messages'));
check('Rate limit creazione notifiche', reliabilityMigration.includes("interval '10 minutes'") && reliabilityMigration.includes('>= 60'));
check('Diagnostica push Admin', shell.includes('Copertura dispositivi') && migration.includes('admin_push_diagnostics'));
check('Migrazione Web Push presente', webMigration.includes('web_push_subscriptions'));
check('Migrazione affidabilità Push presente', reliabilityMigration.includes('push_deliveries') && reliabilityMigration.includes('claim_push_deliveries') && reliabilityMigration.includes('finalize_push_notification'));
check('Coda per singolo dispositivo', reliabilityMigration.includes('unique (notification_id, provider, target_id)'));
check('Claim atomico anti-duplicato', reliabilityMigration.includes('for update skip locked') && reliabilityMigration.includes("status = 'processing'"));
check('Retry esponenziale per dispositivo', pushDispatch.includes('retryAt') && pushDispatch.includes('MAX_ATTEMPTS'));
check('Ricevute Expo verificate', pushDispatch.includes('push/getReceipts') && pushDispatch.includes('processExpoPushReceipts'));
check('Risposte Expo incomplete ritentate', pushDispatch.includes('Risposta Expo Push incompleta') && pushDispatch.includes('markRetry'));
check('Token Expo revocati disattivati', pushDispatch.includes("errorCode === 'DeviceNotRegistered'") && pushDispatch.includes("deactivateTarget(admin, 'expo'"));
check('Invio nativo con TTL e deduplica', pushDispatch.includes('ttl: 86400') && pushDispatch.includes('collapseId') && pushDispatch.includes('tag:'));
check('Web Push con TTL 24 ore', webPushShared.includes('TTL: 86400'));
check('Registrazione nativa demandata al server', store.includes("action: 'register_native'") && !store.includes("from('push_tokens').upsert"));
check('Trasferimento token tra accessi gestito', pushFn.includes("action === 'register_native'") && pushFn.includes("onConflict: 'expo_push_token'"));
check('Aggiornamento token durante runtime', nativeNotifications.includes('addPushTokenListener') && store.includes('subscribeToPushTokenRefresh'));
check('Recupero dopo ritorno online/foreground', store.includes("addEventListener('online'") && store.includes("AppState.addEventListener('change'"));
check('Refresh dati su ricezione e tap', nativeNotifications.includes('addNotificationReceivedListener') && nativeNotifications.includes('addNotificationResponseReceivedListener'));
check('Service Worker segnala push ai client aperti', sw.includes('MARILAB_PUSH_RECEIVED') && sw.includes('postMessage'));
check('Cron verifica retry e ricevute', remindersFn.includes('processExpoPushReceipts') && remindersFn.includes('dispatchPendingNotifications'));
check('Cron ogni 15 minuti', text('supabase/cron_reminders_template.sql').includes("'*/15 * * * *'"));

check('Primo accesso obbligatorio', auth.includes('Crea la tua password'));
check('Recupero password email', auth.includes('Password dimenticata?') && store.includes('resetPasswordForEmail'));
check('Cambio password per tutti', shell.includes('Cambia password') && store.includes('changeOwnPassword'));
check('Creazione utenti Admin', users.includes('Crea utente') && adminFn.includes("action === 'create'"));
check('Reset password temporanea Admin', users.includes('Nuova password') && adminFn.includes("action === 'reset_password'"));
check('Modifica utenti Admin', users.includes('Modifica utente') && adminFn.includes("action === 'update'"));
check('Eliminazione/archiviazione utenti', users.includes('Elimina utente') && adminFn.includes("action === 'delete'"));
check('Conferma elimina utenti compatibile Web', users.includes('window.confirm(`Eliminare o archiviare utente?'));
check('Conferma elimina richieste compatibile Web', shell.includes("window.confirm(`Eliminare richiesta o consegna?"));
check('Protezione ultimo Admin', adminFn.includes('Deve rimanere almeno un Admin attivo'));
check('Chat generale e privata', shell.includes('Chat generale') && shell.includes('Chat privata') && store.includes('recipient_id'));
check('Chat carica gli ultimi 1000 messaggi', store.includes("order('created_at', { ascending: false }).limit(1000)") && store.includes('.sort((left, right) => left.createdAt.localeCompare(right.createdAt))'));
check('Eliminazione messaggio solo Admin', shell.includes("currentUser.role === 'admin'") && adminControlMigration.includes("if not public.is_admin()") && adminControlMigration.includes('delete_chat_message'));
check('Svuotamento chat Admin', shell.includes('Svuota chat') && adminControlMigration.includes('admin_clear_chat_conversation'));
check('Eliminazione totale chat Admin', shell.includes('Elimina tutte le chat') && store.includes('admin_clear_all_chats') && adminControlMigration.includes('admin_clear_all_chats'));
check('Chat private RLS corretta', adminControlMigration.includes('is_active_chat_recipient') && adminControlMigration.includes('public.is_active_chat_recipient(recipient_id)'));
check('Notifica privata usa destinatario reale', store.includes("createGlobalNotification('chat', title, body, requestId, recipientId)"));
check('Messaggio salvato indipendente dalla notifica', store.includes('Messaggio inviato, ma notifica non creata'));
check('Vecchio overload notifiche rimosso', adminControlMigration.includes('drop function if exists public.create_app_notification(text, text, text, uuid)'));
check('Eliminazione consegne qualsiasi stato', adminControlMigration.includes('delete from public.delivery_requests') && !adminControlMigration.includes("target.status not in ('completed', 'cancelled')") && shell.includes('Elimina richiesta o consegna'));
check('Notifiche private protette RLS', migration.includes('recipient_user_id = auth.uid()'));
check('Chat private protette RLS', migration.includes('recipient_id = auth.uid()'));
check('Badge sincronizzato in primo piano', store.includes('syncAppBadgeCount') && webNotifications.includes('MARILAB_BADGE_SYNC'));
check('Badge aggiornato anche da push in background', sw.includes('updateBadgeFromPush') && sw.includes('navigator.setAppBadge') && sw.includes('MARILAB_BADGE_SYNC'));
check('Badge push protetto da duplicati', sw.includes('state.seen.includes(notificationId)') && sw.includes('BADGE_CACHE_NAME'));
check('Icona PWA versionata', manifest.icons?.some((icon) => icon.src === '/icons/icon-192-v182.png') && manifest.icons?.some((icon) => icon.purpose === 'maskable'));
check('Icone Apple complete', ['120', '152', '167', '180'].every((size) => exists(`public/icons/apple-touch-icon-${size}-v182.png`)));
check('Patch HTML PWA dopo export', pkg.scripts?.build?.includes('patch-web-pwa.mjs') && pwaPatch.includes('rel=\"manifest\"') && pwaPatch.includes('apple-touch-icon'));
check('Service Worker registrato anche prima del login', store.includes("prepareWebPushServiceWorker().catch(() => undefined)"));
check('Richiedente senza scelta sede di ritiro', !shell.includes('<ChoiceRow label="Sede di ritiro"'));
check('Sede di ritiro derivata dall’apparecchiatura', shell.includes("const pickupSiteId = selectedEquipment?.currentSiteId ?? ''"));
check('Ultimo strumento sempre visibile al Mover', shell.includes('ULTIMO STRUMENTO CONSEGNATO') && shell.includes('lastCompletedRequest'));
check('Posizione derivata dall’ultima consegna', shell.includes('request.destinationSiteId') && shell.includes('POSIZIONE ATTUALE'));
check('Flusso Mover semplificato', shell.includes('Segna come consegnato'));

check('Nessun mojibake nel runtime', !/[ÃÂ]|â(?:€|€¦|€™|€œ|€)|�/.test(sourceBundle));
check('Nessun TODO/FIXME nel runtime', !/\b(?:TODO|FIXME|HACK)\b/.test(sourceBundle));
check('Nessun console.log nel runtime client', !/console\.(?:log|warn)\(/.test(filesUnder('src').map(text).join('\n')));
check('Edge Function utenti presente', exists('supabase/functions/admin-manage-user/index.ts'));
check('Edge Function push presente', exists('supabase/functions/send-global-push/index.ts'));
check('Edge Function promemoria presente', exists('supabase/functions/scheduled-reminders/index.ts'));
check('Tutte le RPC client esistono negli SQL', missingRpcs.length === 0, missingRpcs.join(', '));
check('Tutte le tabelle usate esistono negli SQL', missingTables.length === 0, missingTables.join(', '));

console.log(`Collaudo statico E1.8.2: ${passed.length} controlli superati.`);
for (const item of passed) console.log(`✓ ${item}`);
if (failures.length) {
  console.error(`\n${failures.length} controlli falliti:`);
  for (const item of failures) console.error(`✗ ${item}`);
  process.exit(1);
}
console.log('\nESITO: SUPERATO');
