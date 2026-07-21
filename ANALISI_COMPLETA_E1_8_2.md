# Marilab Mover E1.8.2 — Analisi completa e correzioni

Autore ufficiale: **Fabio Carratù**  
Dominio operativo da mantenere: **marilab-mover.vercel.app**

## Problemi confermati

### 1. Chat private non inviavano

La policy RLS verificava direttamente il profilo del destinatario. Per gli utenti non Admin quel profilo poteva risultare non visibile, quindi l’inserimento del messaggio privato veniva rifiutato anche se il destinatario era attivo.

**Correzione:** funzione SQL sicura `is_active_chat_recipient()` e nuova policy RLS che verifica il destinatario senza esporre i dati del profilo.

### 2. Falso errore dopo il salvataggio del messaggio

Il messaggio poteva essere salvato correttamente, ma un errore nella creazione/invio della notifica faceva ritornare l’intera operazione come fallita.

**Correzione:** salvataggio chat e notifica sono gestiti separatamente. Un problema push non annulla più un messaggio già inserito.

### 3. Mancava la cancellazione completa delle chat

Erano presenti solo funzioni parziali e non esisteva un comando unico per eliminare chat generale, chat private, chat delle consegne e notifiche collegate.

**Correzione:** nuovo comando Admin `Elimina tutte le chat`, con doppia conferma e cancellazione definitiva dei messaggi e delle notifiche chat.

### 4. Eliminazione richieste/consegne limitata

L’interfaccia consentiva l’eliminazione solo per consegne chiuse o annullate.

**Correzione:** l’Admin può eliminare richieste e consegne in qualsiasi stato. Storico, assegnazioni, chat e notifiche collegate vengono rimossi tramite le relazioni in cascata previste dal database.

### 5. Icona assente sulla schermata Home

L’export Web `single` di Expo generava un `dist/index.html` standard che non includeva i riferimenti al manifest PWA e alle icone Apple, nonostante fossero presenti in `src/app/+html.tsx`.

**Correzione:** nuovo passaggio automatico post-build `scripts/patch-web-pwa.mjs`, che inserisce realmente nel file pubblicato:

- manifest PWA;
- icone Apple 120, 152, 167 e 180 px;
- icone Android/Web 192 e 512 px;
- icone maskable;
- nome applicazione, tema e modalità standalone.

Le icone hanno nomi versionati per evitare il riutilizzo della cache precedente.

### 6. Badge numerico non aggiornato con app chiusa

Il conteggio veniva sincronizzato soltanto dal codice dell’app aperta. Il Service Worker mostrava la notifica ma non aggiornava il badge dell’icona Home.

**Correzione:** il Service Worker aggiorna il badge durante il push in background, mantiene un conteggio persistente, evita incrementi duplicati per la stessa notifica e riceve il conteggio esatto dall’app quando viene aperta o quando le notifiche vengono lette.

### 7. Caricamento chat storiche non corretto

La query ordinava in modo crescente e applicava il limite a 1000: nel tempo avrebbe caricato i 1000 messaggi più vecchi anziché gli ultimi.

**Correzione:** vengono letti gli ultimi 1000 messaggi e poi ordinati cronologicamente nell’interfaccia.

## Sicurezza e compatibilità

- Tutte le cancellazioni richieste sono protette sia nell’interfaccia sia nelle funzioni SQL con controllo `is_admin()`.
- Rimosso il vecchio overload a quattro parametri di `create_app_notification`, che non conteneva i controlli più recenti.
- URL, progetto Supabase, bundle iOS, package Android e login restano invariati.
- Il deploy deve essere eseguito sul progetto Vercel già collegato a `marilab-mover.vercel.app`.
- Nessuna reinstallazione è richiesta per chi usa il sito dal browser.

## Collaudo eseguito

Comando: `npm run check`

Esito:

- lint: superato;
- TypeScript: superato;
- 127 controlli statici: superati;
- simulazione Push: 6 scenari e 14 invarianti superati;
- build Web Expo: superata;
- verifica finale di `dist/index.html`: manifest e icone presenti;
- verifica Service Worker: badge in background e deduplica presenti.

## Passaggio obbligatorio sul database

Eseguire una sola volta:

`supabase/MIGRAZIONE_E1_8_1_ADMIN_CONTROL_CHAT_FIX.sql`

Questa migrazione rimane quella necessaria per chat private e controlli Admin. La correzione icona/badge E1.8.2 è lato Web/PWA e non richiede una nuova migrazione SQL.
