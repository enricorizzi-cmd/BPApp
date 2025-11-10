# 🔍 DIAGNOSI COMPLETA PUSH NOTIFICATIONS - EVENTI E PROBLEMI

**Data Analisi**: 2025-11-10  
**Status**: ⚠️ **NOTIFICHE NON ARRIVANO**

---

## 📋 **ELENCO EVENTI CHE DOVREBBERO INVIARE PUSH**

### **1. POST-APPOINTMENT NOTIFICATIONS** (Post-Vendita / Post-NNCF)
### **2. LEAD ASSIGNMENT NOTIFICATIONS** (Assegnazione Lead)
### **3. VENDITE RIORDINI NOTIFICATIONS** (Feedback Preventivi)
### **4. BP REMINDER NOTIFICATIONS** (Ricordati di compilare BP)
### **5. FRONTEND BANNER PUSH** (Trigger da Banner)
### **6. MANUAL NOTIFICATIONS** (Notifiche Manuali)

---

## 🔬 **DIAGNOSI DETTAGLIATA PER EVENTO**

---

### **1️⃣ POST-APPOINTMENT NOTIFICATIONS**

#### **📌 DESCRIZIONE**
Notifiche inviate automaticamente dopo appuntamenti di vendita completati (ultimi 7 giorni) per chiedere se c'è stata una vendita o se è diventato cliente (NNCF).

#### **🔧 TRIGGER E MECCANISMO**
- **Funzione**: `processPostAppointmentNotifications()` in `notification-manager.js`
- **Job**: `setInterval()` ogni **7 minuti** (riga 2328-2340 `server.js`)
- **Query**: Appuntamenti `type='vendita'` con `end_time` negli ultimi 7 giorni
- **Filtri**: 
  - Se `nncf=true`: controlla `nncfpromptanswered` (deve essere `null` o `false`)
  - Se `nncf=false`: controlla `salepromptanswered` (deve essere `null` o `false`)
- **Tracking**: Verifica `push_notifications_sent` per evitare duplicati

#### **🔍 DIAGNOSI PROBLEMI**

**A. Job Non Eseguito**
- **Sintomo**: Nessun log `[JobMetrics] Post-appointment job started`
- **Cause Possibili**:
  1. Server non avviato correttamente
  2. `notificationManager` non inizializzato
  3. Errore silenzioso nel `setInterval`
- **Verifica**: Cercare nei log `[JobMetrics] Post-appointment`
- **Fix**: Verificare inizializzazione `notificationManager` in `server.js`

**B. Query Non Trova Appuntamenti**
- **Sintomo**: Log `[DEBUG_SCANSIONE] No appointments found in time range`
- **Cause Possibili**:
  1. Nessun appuntamento vendita negli ultimi 7 giorni
  2. Tutti gli appuntamenti hanno `salepromptanswered=true` o `nncfpromptanswered=true`
  3. Query Supabase fallisce silenziosamente
  4. Filtro `type='vendita'` troppo restrittivo
- **Verifica**: Eseguire query SQL diretta su `appointments`
- **Fix**: Verificare dati reali nel database

**C. Notifiche Già Inviate (Tracking)**
- **Sintomo**: Log `[DEBUG_PUSH] Appointment X already sent: true`
- **Cause Possibili**:
  1. Notifica già inviata e marcata in `push_notifications_sent`
  2. `isNotificationSent()` restituisce `true` anche se non inviata (fail-safe)
  3. Query tracking fallisce e assume già inviata
- **Verifica**: Controllare tabella `push_notifications_sent`
- **Fix**: Verificare logica `isNotificationSent()` e query tracking

**D. Subscription Mancanti**
- **Sintomo**: Log `[NotificationManager] No subscriptions found for user X`
- **Cause Possibili**:
  1. Utente non ha registrato subscription push
  2. Subscription scadute/invalide e rimosse
  3. `getValidSubscriptions()` non trova subscription per `userid`
- **Verifica**: Query `SELECT * FROM push_subscriptions WHERE userid = 'X'`
- **Fix**: Verificare registrazione subscription e cleanup automatico

**E. VAPID Keys Mancanti/Invalide**
- **Sintomo**: Log `[Notifications] Push notifications not configured`
- **Cause Possibili**:
  1. `VAPID_PUBLIC_KEY` o `VAPID_PRIVATE_KEY` non settate
  2. Keys invalide o scadute
  3. `webpush` module non inizializzato
- **Verifica**: Controllare variabili ambiente Render
- **Fix**: Verificare e rigenerare VAPID keys se necessario

**F. Utente Non Esiste**
- **Sintomo**: Log `[NotificationManager] User not found: X`
- **Cause Possibili**:
  1. `appointment.userid` non corrisponde a `app_users.id`
  2. Utente eliminato ma appuntamenti rimasti
  3. Validazione `sendPushNotification()` fallisce
- **Verifica**: Query `SELECT * FROM app_users WHERE id = 'X'`
- **Fix**: Verificare integrità referenziale

**G. Delivery Fallita**
- **Sintomo**: Log `[DEBUG_PUSH] Send result: sent=0, failed=1`
- **Cause Possibili**:
  1. Subscription endpoint invalido (410/404)
  2. Keys subscription corrotte
  3. Errore webpush durante invio
  4. Network error
- **Verifica**: Log dettagliati errori webpush
- **Fix**: Cleanup subscription invalide, verificare endpoint

**H. Marking Tracking Fallito**
- **Sintomo**: Log `[DEBUG_PUSH] Mark result: FAILED`
- **Cause Possibili**:
  1. `markNotificationSent()` fallisce (errore Supabase)
  2. Constraint unique violation
  3. `appointmentid` o `resource_id` null
- **Verifica**: Log errori Supabase in `markNotificationSent()`
- **Fix**: Verificare schema tabella e logica tracking

#### **📊 STATO ATTUALE DATABASE**
- **Subscription**: 32 totali, 8 utenti unici ✅
- **Tracking**: 
  - `post_sale`: 23 notifiche, ultima: 2025-11-06 16:34 ⚠️ (4 giorni fa)
  - `post_nncf`: 18 notifiche, ultima: 2025-11-10 14:36 ✅ (oggi)
- **Problema**: `post_sale` non inviate da 4 giorni

---

### **2️⃣ LEAD ASSIGNMENT NOTIFICATIONS**

#### **📌 DESCRIZIONE**
Notifica inviata quando un lead viene assegnato a un consulente (creazione o aggiornamento lead con `consulente_assegnato`).

#### **🔧 TRIGGER E MECCANISMO**
- **Funzione**: `sendLeadAssignmentNotification()` in `routes/leads.js`
- **Trigger**: 
  - `POST /api/leads` (creazione) - riga 429
  - `POST /api/leads` (update) - riga 509 via `checkAndNotifyConsultantChange()`
- **Condizione**: `consulente_assegnato` presente e diverso da precedente
- **Tracking**: Usa `resource_id` con `useResourceId=true`

#### **🔍 DIAGNOSI PROBLEMI**

**A. NotificationManager Non Inizializzato**
- **Sintomo**: Log `[LeadNotification] NotificationManager not available`
- **Cause Possibili**:
  1. Errore durante `require('../lib/notification-manager')`
  2. `notificationManager` rimane `null` dopo inizializzazione
- **Verifica**: Log `[Leads] NotificationManager initialized successfully`
- **Fix**: Verificare inizializzazione in `routes/leads.js` righe 8-21

**B. ConsultantId Invalido**
- **Sintomo**: Log `[LeadNotification] Invalid consultantId: X`
- **Cause Possibili**:
  1. `consulente_assegnato` vuoto/null
  2. Tipo non stringa
- **Verifica**: Validazione input in `sendLeadAssignmentNotification()`
- **Fix**: Verificare payload richiesta API

**C. Consulente Non Esiste**
- **Sintomo**: Log `[LeadNotification] Consultant not found: X`
- **Cause Possibili**:
  1. `consulente_assegnato` non corrisponde a `app_users.id`
  2. Utente eliminato
- **Verifica**: Query `SELECT * FROM app_users WHERE id = 'X'`
- **Fix**: Verificare integrità referenziale

**D. Notifica Già Inviata**
- **Sintomo**: Log `[LeadNotification] Notification already sent for lead X`
- **Cause Possibili**:
  1. `isNotificationSent(leadId, 'lead-assignment', true)` restituisce `true`
  2. Tracking in `push_notifications_sent` con `resource_id=leadId`
- **Verifica**: Query tracking per lead specifico
- **Fix**: Verificare logica `isNotificationSent()` con `useResourceId=true`

**E. Subscription Mancanti**
- **Sintomo**: Log `[NotificationManager] No subscriptions found for user X`
- **Cause Possibili**: Stesso problema di Post-Appointment (sezione 1.D)
- **Verifica**: Stessa verifica di Post-Appointment
- **Fix**: Stesso fix di Post-Appointment

**F. Delivery Fallita**
- **Sintomo**: Log `[LeadNotification] Send result: sent=0, failed=1`
- **Cause Possibili**: Stesso problema di Post-Appointment (sezione 1.G)
- **Verifica**: Stessa verifica di Post-Appointment
- **Fix**: Stesso fix di Post-Appointment

#### **📊 STATO ATTUALE DATABASE**
- **Tracking**: `lead-assignment`: 5 notifiche, ultima: 2025-11-10 15:07 ✅ (oggi)
- **Status**: Funziona correttamente ✅

---

### **3️⃣ VENDITE RIORDINI NOTIFICATIONS**

#### **📌 DESCRIZIONE**
Notifica inviata alle 19:00 per chiedere feedback su preventivi con `data_feedback = oggi` e `stato != 'confermato'` e `!= 'rifiutato'`.

#### **🔧 TRIGGER E MECCANISMO**
- **Funzione**: `processVenditeRiordiniNotifications()` in `notification-manager.js`
- **Job**: `setInterval()` ogni **7 minuti** (riga 2343-2355 `server.js`)
- **Condizione Orario**: Solo se `currentHour === 19` (riga 502)
- **Query**: `vendite_riordini` con `data_feedback = oggi` e `stato NOT IN ('confermato', 'rifiutato')`
- **Tracking**: Usa `appointmentid` con `useResourceId=false`

#### **🔍 DIAGNOSI PROBLEMI**

**A. Job Non Eseguito**
- **Sintomo**: Nessun log `[JobMetrics] Vendite riordini job started`
- **Cause Possibili**: Stesso problema di Post-Appointment (sezione 1.A)
- **Verifica**: Cercare nei log `[JobMetrics] Vendite riordini`
- **Fix**: Stesso fix di Post-Appointment

**B. Orario Non Corretto**
- **Sintomo**: Log `[VenditeRiordini] Not 19:00 yet (current: X:Y), skipping`
- **Cause Possibili**:
  1. Job eseguito fuori dalle 19:00
  2. Timezone server diverso da atteso
  3. Job eseguito solo ogni 7 minuti (potrebbe saltare le 19:00)
- **Verifica**: Controllare timezone server e orario esecuzione
- **Fix**: Verificare che job sia eseguito alle 19:00 (tolleranza ±3 minuti)

**C. Query Non Trova Vendite**
- **Sintomo**: Log `[VenditeRiordini] No vendite found for today`
- **Cause Possibili**:
  1. Nessuna vendita con `data_feedback = oggi`
  2. Tutte le vendite hanno `stato IN ('confermato', 'rifiutato')`
  3. Query Supabase fallisce
- **Verifica**: Query SQL diretta su `vendite_riordini`
- **Fix**: Verificare dati reali nel database

**D. Notifica Già Inviata**
- **Sintomo**: Log `[VenditeRiordini] Notification already sent for X`
- **Cause Possibili**: Stesso problema di Post-Appointment (sezione 1.C)
- **Verifica**: Stessa verifica di Post-Appointment
- **Fix**: Stesso fix di Post-Appointment

**E. Subscription/Delivery Problemi**
- **Sintomo**: Stessi problemi di Post-Appointment (sezioni 1.D, 1.E, 1.G)
- **Verifica**: Stesse verifiche di Post-Appointment
- **Fix**: Stessi fix di Post-Appointment

#### **📊 STATO ATTUALE DATABASE**
- **Tracking**: `vendite-feedback`: 1 notifica, ultima: 2025-11-04 12:43 ⚠️ (6 giorni fa)
- **Problema**: Nessuna notifica recente (potrebbe essere normale se non ci sono vendite da notificare)

---

### **4️⃣ BP REMINDER NOTIFICATIONS**

#### **📌 DESCRIZIONE**
Notifica inviata sabato/domenica alle 12:00 per ricordare di compilare il Battle Plan.

#### **🔧 TRIGGER E MECCANISMO**
- **Funzione**: `sendBPReminderNotification()` in `notification-manager.js`
- **Job**: `setInterval()` ogni **1 minuto** (riga 2320-2325 `server.js`)
- **Condizione**: Solo sabato/domenica alle 12:00 (controllo in `sendBPReminderNotifications()`)
- **Query**: Tutti gli utenti attivi
- **Tracking**: Non tracciato (notifica generica)

#### **🔍 DIAGNOSI PROBLEMI**

**A. Job Non Eseguito**
- **Sintomo**: Nessun log `[BP] BP reminder notifications sent`
- **Cause Possibili**: Stesso problema di Post-Appointment (sezione 1.A)
- **Verifica**: Cercare nei log `[BP] BP reminder`
- **Fix**: Stesso fix di Post-Appointment

**B. Orario/Giorno Non Corretto**
- **Sintomo**: Job eseguito ma non alle 12:00 di sabato/domenica
- **Cause Possibili**:
  1. Timezone server diverso
  2. Logica controllo giorno/orario errata
  3. `LAST_BP_REMINDER_MARK` previene invio multiplo
- **Verifica**: Controllare logica in `sendBPReminderNotifications()`
- **Fix**: Verificare timezone e logica orario

**C. Query Utenti Fallisce**
- **Sintomo**: Log errore query `app_users`
- **Cause Possibili**:
  1. Query Supabase fallisce
  2. Nessun utente trovato
- **Verifica**: Query SQL diretta su `app_users`
- **Fix**: Verificare query e dati

**D. Subscription/Delivery Problemi**
- **Sintomo**: Stessi problemi di Post-Appointment (sezioni 1.D, 1.E, 1.G)
- **Verifica**: Stesse verifiche di Post-Appointment
- **Fix**: Stessi fix di Post-Appointment

---

### **5️⃣ FRONTEND BANNER PUSH**

#### **📌 DESCRIZIONE**
Notifica push inviata dal frontend quando appare un banner post-vendita o post-NNCF (fallback se backend non ha inviato).

#### **🔧 TRIGGER E MECCANISMO**
- **Funzione**: `triggerPush()` in `frontend/src/postSaleBanners.js`
- **Trigger**: Quando `enqueueBanner()` viene chiamato per un appuntamento
- **Condizioni**:
  1. Banner non già risposto (`isBannerAnswered()`)
  2. Banner non in snooze (`isBannerSnoozed()`)
  3. Push non già inviato (`pushSent()`)
- **Endpoint**: `POST /api/notifications/send` (notifiche manuali)

#### **🔍 DIAGNOSI PROBLEMI**

**A. Banner Non Appare**
- **Sintomo**: `triggerPush()` non viene chiamato
- **Cause Possibili**:
  1. `scan()` non trova appuntamenti
  2. `enqueueBanner()` non viene chiamato
  3. Banner già risposto/snoozed
  4. Push già inviato (backend ha preceduto)
- **Verifica**: Log `[BANNER] Processing:` in console browser
- **Fix**: Verificare logica `scan()` e `enqueueBanner()`

**B. Push Già Inviato**
- **Sintomo**: Log `triggerPush early return - already sent`
- **Cause Possibili**:
  1. Backend ha già inviato notifica
  2. `pushSent()` restituisce `true`
  3. Tracking in `push_notifications_sent` presente
- **Verifica**: Query `push_notifications_sent` per appuntamento
- **Fix**: Comportamento atteso (evita duplicati)

**C. ConsultantId Mancante**
- **Sintomo**: Log `[BANNER] ConsultantId not available, skipping push`
- **Cause Possibili**:
  1. `appt.userId` o `appt.consultantId` mancante
  2. `window.getUser()` non disponibile
- **Verifica**: Log `[BANNER] Processing:` mostra `ConsultantId`
- **Fix**: Verificare struttura dati appuntamento

**D. API Notifications Fallisce**
- **Sintomo**: Errore chiamata `POST /api/notifications/send`
- **Cause Possibili**:
  1. Endpoint non disponibile
  2. Autenticazione fallisce
  3. Subscription non caricate correttamente
- **Verifica**: Log errori network in console browser
- **Fix**: Verificare endpoint e autenticazione

**E. Subscription Mancanti (API)**
- **Sintomo**: API restituisce `sent=0`
- **Cause Possibili**:
  1. Subscription non caricate da `push_subscriptions.json` (legacy)
  2. Subscription non trovate per utente
- **Verifica**: Log API response
- **Fix**: Verificare caricamento subscription in `routes/notifications.js`

---

### **6️⃣ MANUAL NOTIFICATIONS**

#### **📌 DESCRIZIONE**
Notifiche inviate manualmente via API `POST /api/notifications/send`.

#### **🔧 TRIGGER E MECCANISMO**
- **Endpoint**: `POST /api/notifications/send` in `routes/notifications.js`
- **Trigger**: Chiamata manuale via API
- **Recipients**: `'all'` o array di `userId`
- **Subscription**: Caricate da `push_subscriptions.json` (legacy) o Supabase

#### **🔍 DIAGNOSI PROBLEMI**

**A. Subscription Non Caricate**
- **Sintomo**: Log `[Notifications] Error loading subscriptions`
- **Cause Possibili**:
  1. File `push_subscriptions.json` non esiste
  2. Formato file errato
  3. Errore `readJSON()`
- **Verifica**: Verificare esistenza e formato file
- **Fix**: Verificare file o migrare a Supabase

**B. VAPID Keys Mancanti**
- **Sintomo**: Log `[Notifications] Push notifications not configured`
- **Cause Possibili**: Stesso problema di Post-Appointment (sezione 1.E)
- **Verifica**: Stessa verifica di Post-Appointment
- **Fix**: Stesso fix di Post-Appointment

**C. Delivery Fallita**
- **Sintomo**: `sent=0, failed>0` nella risposta
- **Cause Possibili**: Stesso problema di Post-Appointment (sezione 1.G)
- **Verifica**: Stessa verifica di Post-Appointment
- **Fix**: Stesso fix di Post-Appointment

---

## 📊 **TABELLA RIASSUNTIVA DIAGNOSI**

| **EVENTO** | **TRIGGER** | **FREQUENZA** | **STATO DB** | **PROBLEMA PRINCIPALE** | **PRIORITÀ** |
|------------|-------------|---------------|--------------|-------------------------|-------------|
| **1. Post-Appointment** | Job ogni 7min | Continuo | ⚠️ `post_sale` fermo da 4gg | Job non trova appuntamenti o subscription mancanti | 🔴 **ALTA** |
| **2. Lead Assignment** | API POST/UPDATE | On-demand | ✅ Funziona | Nessuno (funziona) | 🟢 **OK** |
| **3. Vendite Riordini** | Job ogni 7min @19:00 | Giornaliero | ⚠️ Fermo da 6gg | Nessuna vendita o orario non corretto | 🟡 **MEDIA** |
| **4. BP Reminder** | Job ogni 1min @12:00 WE | Settimanale | ❓ Non tracciato | Difficile verificare senza tracking | 🟡 **MEDIA** |
| **5. Frontend Banner** | Banner appare | On-demand | ❓ Non tracciato | Dipende da backend (evita duplicati) | 🟢 **OK** |
| **6. Manual** | API chiamata | On-demand | ❓ Non tracciato | Dipende da subscription e VAPID | 🟡 **MEDIA** |

---

## 🎯 **PROBLEMI COMUNI A TUTTI GLI EVENTI**

### **1. VAPID Keys Mancanti/Invalide** 🔴
- **Impatto**: **CRITICO** - Nessuna notifica può essere inviata
- **Verifica**: Controllare variabili ambiente `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`
- **Fix**: Rigenerare keys se necessario

### **2. Subscription Mancanti/Invalide** 🔴
- **Impatto**: **CRITICO** - Notifiche non possono essere consegnate
- **Verifica**: Query `SELECT * FROM push_subscriptions WHERE userid = 'X'`
- **Fix**: Verificare registrazione subscription e cleanup automatico

### **3. Job Non Eseguiti** 🟡
- **Impatto**: **MEDIO** - Notifiche automatiche non partono
- **Verifica**: Log `[JobMetrics]` nei log backend
- **Fix**: Verificare inizializzazione `notificationManager` e `setInterval`

### **4. Tracking Errato** 🟡
- **Impatto**: **MEDIO** - Duplicati o notifiche saltate
- **Verifica**: Query `push_notifications_sent` per appuntamento/lead
- **Fix**: Verificare logica `isNotificationSent()` e `markNotificationSent()`

### **5. Utente Non Esiste** 🟡
- **Impatto**: **MEDIO** - Notifica non inviata per utente specifico
- **Verifica**: Query `SELECT * FROM app_users WHERE id = 'X'`
- **Fix**: Verificare integrità referenziale

---

## 🔧 **CHECKLIST VERIFICA IMMEDIATA**

### **Verifica 1: VAPID Keys** 🔴
- [ ] `VAPID_PUBLIC_KEY` presente in variabili ambiente
- [ ] `VAPID_PRIVATE_KEY` presente in variabili ambiente
- [ ] Keys valide e non scadute
- [ ] `webpush` module inizializzato correttamente

### **Verifica 2: Subscription** 🔴
- [ ] Almeno una subscription per utente attivo
- [ ] Subscription non scadute (lastseen recente)
- [ ] Endpoint subscription valido
- [ ] Keys subscription (p256dh, auth) presenti

### **Verifica 3: Job Esecuzione** 🟡
- [ ] Log `[JobMetrics] Post-appointment job started` ogni 7 minuti
- [ ] Log `[JobMetrics] Vendite riordini job started` ogni 7 minuti
- [ ] Log `[JobMetrics] Subscription cleanup started` ogni 4 ore
- [ ] Nessun errore nei log job

### **Verifica 4: Query Database** 🟡
- [ ] Query `appointments` trova appuntamenti vendita recenti
- [ ] Query `vendite_riordini` trova vendite con data_feedback oggi
- [ ] Query `push_subscriptions` trova subscription per utenti
- [ ] Query `push_notifications_sent` mostra tracking corretto

### **Verifica 5: NotificationManager** 🟡
- [ ] `notificationManager` inizializzato in `server.js`
- [ ] `notificationManager` inizializzato in `routes/leads.js`
- [ ] Nessun errore durante inizializzazione
- [ ] Funzioni esportate disponibili

---

## 📝 **NOTE FINALI**

1. **Post-Appointment** è il problema principale: `post_sale` fermo da 4 giorni
2. **Lead Assignment** funziona correttamente ✅
3. **Vendite Riordini** potrebbe essere normale (nessuna vendita da notificare)
4. **BP Reminder** difficile da verificare senza tracking
5. **Frontend Banner** dipende da backend (evita duplicati correttamente)
6. **Manual** dipende da subscription e VAPID

**Prossimi passi**: Verificare VAPID keys, subscription, e log job per identificare il problema specifico.

