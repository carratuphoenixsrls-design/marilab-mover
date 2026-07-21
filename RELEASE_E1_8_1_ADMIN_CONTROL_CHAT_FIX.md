# Marilab Mover E1.8.1 — Admin Control & Private Chat Fix

Autore ufficiale: **Fabio Carratù**

## Correzioni incluse

- Corretto l’invio delle chat private per Richiedenti, Mover e Admin.
- Rimossa la falsa segnalazione “Invio non riuscito” quando il messaggio era stato salvato ma la notifica non era stata creata.
- Eliminazione di singoli messaggi riservata esclusivamente agli Admin.
- Svuotamento definitivo della conversazione corrente riservato agli Admin.
- Nuovo comando **Elimina tutte le chat**: cancella chat generale, private, chat delle consegne e notifiche chat.
- Eliminazione Admin di richieste e consegne in **qualsiasi stato**, comprese pendenti, assegnate, in viaggio, consegnate, chiuse e annullate.
- Doppia conferma per le cancellazioni distruttive.
- Installazione Vercel resa riproducibile con `npm ci`.
- Vincolo Node LTS corretto (`>=20 <23`).

## Aggiornamento obbligatorio Supabase

Eseguire una sola volta nel SQL Editor:

`supabase/MIGRAZIONE_E1_8_1_ADMIN_CONTROL_CHAT_FIX.sql`

Senza questa migrazione, la nuova interfaccia Admin non può applicare i nuovi permessi e la chat privata può continuare a essere bloccata dalla vecchia policy RLS.
