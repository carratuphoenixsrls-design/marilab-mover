# Configurazione Supabase E1.6.9

Progetto: `nfiscouwoblfdkppcgcg`

## Database operativo esistente

Applicare una sola volta:

```text
supabase/MIGRAZIONE_E1_6_9_PUSH_RELIABILITY.sql
supabase/MIGRAZIONE_E1_8_1_ADMIN_CONTROL_CHAT_FIX.sql
```

Non rieseguire `schema.sql` sul progetto operativo.

## Nuova installazione

Eseguire `supabase/schema.sql` e tutte le migrazioni nell’ordine numerico, terminando con `MIGRAZIONE_E1_8_1_ADMIN_CONTROL_CHAT_FIX.sql`. Lo schema base da solo non rappresenta tutte le evoluzioni successive.

## Edge Functions da pubblicare

```powershell
npx supabase@latest link --project-ref nfiscouwoblfdkppcgcg
npx supabase@latest functions deploy send-global-push
npx supabase@latest functions deploy scheduled-reminders --no-verify-jwt
```

`send-global-push` gestisce configurazione, registrazione dispositivi, invio immediato e test. `scheduled-reminders` gestisce promemoria, retry e ricevute Expo.

## Segreti richiesti

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`
- `CRON_SECRET`

Le variabili automatiche Supabase richieste dalle funzioni sono:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

La chiave privata VAPID, la service role e il segreto Cron non devono essere inseriti nel frontend o nel repository.

## Cron

Il modello `supabase/cron_reminders_template.sql` pianifica la funzione ogni 15 minuti. Usare `CONFIGURA_PROMEMORIA_AUTOMATICI.bat`, eseguire il file generato nel SQL Editor e cancellarlo subito dopo.
