# Test Web Push — branch agent/fix-web-push-registration

Questa branch corregge esclusivamente la registrazione Web Push della release E1.6.9.

## Verifiche automatiche eseguite

- `npm run lint`
- `npm run typecheck`
- `npm run verify:final` — 115 controlli superati
- `npm run verify:push` — 6 scenari e 14 invarianti superati
- `npm run build`

## Test reale richiesto prima del merge

1. Distribuire la Edge Function `send-global-push` dalla branch.
2. Aprire il deployment Preview Vercel della branch.
3. In Chrome Windows cancellare eventuale vecchia autorizzazione/sottoscrizione del sito oppure usare una finestra pulita.
4. Accedere e premere **Attiva su questo dispositivo**.
5. Verificare che lo stato diventi **Notifiche Web Push attive**.
6. Premere **Invia test** e verificare la ricezione.
7. Ripetere su Edge/PWA e poi su Android/iPhone PWA.

Non eseguire merge su `main` finché il test reale Chrome Windows non è superato.
