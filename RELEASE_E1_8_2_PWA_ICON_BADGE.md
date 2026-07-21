# Marilab Mover E1.8.2 — PWA Icon & Badge Reliability

Autore ufficiale: **Fabio Carratù**

Release completa basata sulla E1.8.1, compatibile con il dominio operativo esistente `marilab-mover.vercel.app`.

## Incluso

- chat private corrette per tutti i ruoli;
- eliminazione singoli messaggi solo Admin;
- svuotamento conversazione solo Admin;
- eliminazione totale di tutte le chat solo Admin;
- eliminazione Admin di richieste/consegne in qualsiasi stato;
- icona reale quando l’app viene aggiunta alla schermata Home;
- icone Apple e Android versionate e complete;
- badge numerico aggiornato dal Service Worker anche a PWA chiusa;
- deduplica del conteggio badge;
- caricamento degli ultimi 1000 messaggi chat;
- build Vercel riproducibile con npm.

## Importante per iPhone/iPad

Dopo il deploy, un’icona Home già creata senza immagine può conservare la vecchia cache di iOS. In quel caso eliminarla dalla Home e aggiungere nuovamente `marilab-mover.vercel.app` da Safari.

Per vedere il badge occorre aprire l’app dall’icona Home e consentire le notifiche.

## Database

Prima del deploy, se non è già stata applicata, eseguire:

`supabase/MIGRAZIONE_E1_8_1_ADMIN_CONTROL_CHAT_FIX.sql`
