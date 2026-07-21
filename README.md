# Marilab Mover E1.8.2 — Admin Control, PWA Icon & Badge

Release correttiva completa Web/PWA, Android e iOS. Mantiene il dominio operativo esistente e include: chat private corrette, eliminazione totale chat solo Admin, eliminazione Admin di richieste/consegne in qualsiasi stato, icone Home reali e badge numerico aggiornato anche in background.

## Aggiornamento dalla versione operativa

1. Se non già eseguita, applicare `supabase/MIGRAZIONE_E1_8_1_ADMIN_CONTROL_CHAT_FIX.sql`.
2. Eseguire `npm ci --no-audit --no-fund`.
3. Eseguire `npm run check`.
4. Collegare la cartella al progetto Vercel **esistente** di `marilab-mover.vercel.app`.
5. Pubblicare con `npx vercel --prod` oppure `DEPLOY_E1_8_2_STESSO_DOMINIO.bat`.

Dettagli: `ANALISI_COMPLETA_E1_8_2.md` e `RELEASE_E1_8_2_PWA_ICON_BADGE.md`.

---

## Base precedente E1.6.9 — Push Reliability Multi‑Device

Autore ufficiale: **Fabio Carratù**

Release completa per Web/PWA, Android e iOS. La E1.6.9 mantiene tutte le funzioni della E1.6.8 e sostituisce la vecchia gestione Push globale con una coda affidabile **per singolo dispositivo**.

## Correzioni principali

- Invio simultaneo a tutti i browser/PWA, telefoni Android e iPhone registrati.
- Stato separato per ciascun dispositivo: un Android riuscito non nasconde più un iPhone o browser fallito.
- Claim atomico PostgreSQL con `FOR UPDATE SKIP LOCKED` e lease anti-duplicazione.
- Fino a 6 tentativi per dispositivo con attesa progressiva.
- Controllo delle ricevute Expo dopo l’accettazione del gateway.
- Disattivazione automatica dei token Expo e delle sottoscrizioni Web revocati/scaduti.
- TTL di 24 ore, priorità alta e deduplicazione per notifica.
- Aggiornamento automatico del token durante il runtime e nuova registrazione al ritorno online/in primo piano.
- Test Push indirizzato esclusivamente al dispositivo corrente e verificato come appartenente all’utente autenticato.
- Broadcast di sistema riservati agli Admin, rate limit e validazione della notifica rispetto all’azione reale che l’ha generata.
- Cron ogni 15 minuti per promemoria, retry e ricevute.
- Diagnostica Admin con consegne in coda ed errori delle ultime 24 ore.

## Collaudo eseguito

```powershell
npm ci
npm run lint
npm run typecheck
npm run verify:final
npm run verify:push
npm run build
```

Esiti della release:

- ESLint Expo: superato;
- TypeScript strict: superato;
- 114 controlli statici: superati;
- simulazione Push: 6 scenari multi-dispositivo + 14 invarianti: superati;
- Edge Functions Deno: 4 file controllati senza errori;
- SQL E1.6.9 e cron: parsing PostgreSQL superato;
- Expo prebuild Android/iOS: superato; permesso Android 13, package, bundle ed entitlement Push verificati;
- bundle JavaScript/Hermes Android e iOS: generati con successo;
- Expo Web export: completato in `dist`;
- dipendenze: 0 vulnerabilità alte o critiche; 11 moderate transitive della toolchain Expo, senza correzione compatibile proposta da npm.

## Pubblicazione

Seguire nell’ordine `ISTRUZIONI_RAPIDE_E1_6_9.txt`:

1. applicare `supabase/MIGRAZIONE_E1_6_9_PUSH_RELIABILITY.sql` una sola volta;
2. pubblicare `send-global-push` e `scheduled-reminders`;
3. configurare/aggiornare il cron ogni 15 minuti;
4. pubblicare il frontend su Vercel;
5. creare nuove build native Android/iOS E1.6.9.

## Nota di affidabilità

Il software gestisce correttamente invii parziali, retry, token cambiati e più dispositivi. Nessuna applicazione può però forzare la visualizzazione quando il dispositivo è senza rete oltre il TTL, i permessi sono revocati, Android è stato forzatamente arrestato, iOS applica modalità Focus/Riepilogo, oppure FCM/APNs/Web Push sono indisponibili. Queste condizioni sono rilevate o recuperate quando tecnicamente possibile e sono incluse nella matrice di collaudo.

La chiave VAPID privata, la `service_role`, il segreto Cron e le credenziali FCM/APNs non devono essere inseriti nel repository.
