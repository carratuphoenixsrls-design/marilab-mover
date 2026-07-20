# Web Push registration fix

## Modifiche

- serializzazione esplicita di `endpoint`, `p256dh` e `auth`;
- fallback a `PushSubscription.getKey()` quando `toJSON()` non espone le chiavi;
- rinnovo singolo delle sottoscrizioni incomplete o corrotte;
- priorità alla VAPID key della build rispetto alla cache del browser;
- rimozione del fallback VAPID fisso incorporato;
- normalizzazione lato Edge Function dei payload annidati o piatti;
- diagnostica booleana dei campi mancanti senza esporre chiavi;
- accettazione della Edge Function limitata a richieste POST;
- aggiornamento dei controlli statici per Node 22 e PNPM Vercel.

## Esclusioni intenzionali

Nessuna modifica a database, migrazioni, RLS, service worker, ruoli, schermate, consegne, chat o funzioni Android/iOS.
