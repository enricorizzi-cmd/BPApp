# 📊 TABELLA IPER RIASSUNTIVA - EVENTI PUSH NOTIFICATIONS

**Data**: 2025-11-10  
**Status**: ⚠️ **NOTIFICHE NON ARRIVANO**

---

## 🎯 **TABELLA DIAGNOSI EVENTI**

| **#** | **EVENTO** | **TRIGGER** | **FREQUENZA** | **STATO DB** | **DIAGNOSI PROBLEMA** | **PRIORITÀ** |
|-------|------------|-------------|---------------|--------------|------------------------|-------------|
| **1** | **Post-Appointment**<br/>(Post-Vendita/NNCF) | Job `setInterval` ogni **7 minuti**<br/>Funzione: `processPostAppointmentNotifications()` | Continuo<br/>(ogni 7min) | ⚠️ **PROBLEMA**<br/>- `post_sale`: 23 notifiche<br/>- Ultima: **2025-11-06 16:34**<br/>(**4 giorni fa**)<br/>- `post_nncf`: 18 notifiche<br/>- Ultima: **2025-11-10 14:36**<br/>(oggi ✅) | **🔴 CRITICO**: `post_sale` fermo da 4 giorni<br/><br/>**Possibili cause**:<br/>1. Job non trova appuntamenti vendita recenti<br/>2. Tutti gli appuntamenti hanno `salepromptanswered=true`<br/>3. Subscription mancanti per utenti<br/>4. Query Supabase fallisce silenziosamente<br/>5. `isNotificationSent()` restituisce `true` anche se non inviata<br/>6. VAPID keys mancanti/invalide<br/>7. Utente non esiste in `app_users`<br/>8. Delivery fallita (endpoint 410/404) | 🔴 **ALTA** |
| **2** | **Lead Assignment**<br/>(Assegnazione Lead) | API `POST /api/leads`<br/>(creazione/update)<br/>Funzione: `sendLeadAssignmentNotification()` | On-demand<br/>(quando lead assegnato) | ✅ **OK**<br/>- `lead-assignment`: 5 notifiche<br/>- Ultima: **2025-11-10 15:07**<br/>(oggi ✅) | **🟢 FUNZIONA**: Nessun problema rilevato<br/><br/>**Verifiche OK**:<br/>1. NotificationManager inizializzato ✅<br/>2. ConsultantId valido ✅<br/>3. Subscription presenti ✅<br/>4. Delivery riuscita ✅ | 🟢 **OK** |
| **3** | **Vendite Riordini**<br/>(Feedback Preventivi) | Job `setInterval` ogni **7 minuti**<br/>Solo alle **19:00**<br/>Funzione: `processVenditeRiordiniNotifications()` | Giornaliero<br/>(solo @19:00) | ⚠️ **SOSPETTO**<br/>- `vendite-feedback`: 1 notifica<br/>- Ultima: **2025-11-04 12:43**<br/>(**6 giorni fa**)<br/>- Potrebbe essere normale<br/>(nessuna vendita da notificare) | **🟡 MEDIO**: Nessuna notifica recente<br/><br/>**Possibili cause**:<br/>1. Nessuna vendita con `data_feedback = oggi`<br/>2. Tutte le vendite hanno `stato IN ('confermato', 'rifiutato')`<br/>3. Job non eseguito alle 19:00 (timezone/server)<br/>4. Job eseguito ma orario non corretto<br/>5. Subscription mancanti<br/>6. VAPID keys mancanti | 🟡 **MEDIA** |
| **4** | **BP Reminder**<br/>(Ricordati BP) | Job `setInterval` ogni **1 minuto**<br/>Solo **sabato/domenica @12:00**<br/>Funzione: `sendBPReminderNotification()` | Settimanale<br/>(WE @12:00) | ❓ **NON TRACCIATO**<br/>- Nessun tracking in DB<br/>- Difficile verificare | **🟡 MEDIO**: Difficile da verificare<br/><br/>**Possibili cause**:<br/>1. Job non eseguito<br/>2. Orario/giorno non corretto (timezone)<br/>3. `LAST_BP_REMINDER_MARK` previene invio multiplo<br/>4. Query utenti fallisce<br/>5. Subscription mancanti<br/>6. VAPID keys mancanti | 🟡 **MEDIA** |
| **5** | **Frontend Banner Push**<br/>(Trigger da Banner) | Quando banner appare<br/>Funzione: `triggerPush()`<br/>in `postSaleBanners.js` | On-demand<br/>(quando banner appare) | ❓ **NON TRACCIATO**<br/>- Dipende da backend<br/>- Evita duplicati | **🟢 OK**: Comportamento atteso<br/><br/>**Nota**: Dipende da backend<br/>- Se backend ha già inviato, frontend non invia (evita duplicati) ✅<br/>- Se backend non ha inviato, frontend invia come fallback<br/><br/>**Possibili cause se non funziona**:<br/>1. Banner non appare<br/>2. Push già inviato (backend preceduto)<br/>3. ConsultantId mancante<br/>4. API `/api/notifications/send` fallisce | 🟢 **OK** |
| **6** | **Manual Notifications**<br/>(Notifiche Manuali) | API `POST /api/notifications/send`<br/>Chiamata manuale | On-demand<br/>(chiamata manuale) | ❓ **NON TRACCIATO**<br/>- Dipende da subscription<br/>- Dipende da VAPID | **🟡 MEDIO**: Dipende da configurazione<br/><br/>**Possibili cause se non funziona**:<br/>1. Subscription non caricate da `push_subscriptions.json`<br/>2. VAPID keys mancanti<br/>3. Delivery fallita<br/>4. Endpoint non disponibile | 🟡 **MEDIA** |

---

## 🔴 **PROBLEMI COMUNI A TUTTI GLI EVENTI**

### **1. VAPID Keys Mancanti/Invalide** 🔴 **CRITICO**
- **Impatto**: **BLOCCA TUTTE LE NOTIFICHE**
- **Verifica**: Controllare variabili ambiente Render `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`
- **Sintomo**: Log `[Notifications] Push notifications not configured`
- **Fix**: Rigenerare keys se necessario

### **2. Subscription Mancanti/Invalide** 🔴 **CRITICO**
- **Impatto**: **NOTIFICHE NON CONSEGNATE**
- **Verifica**: Query `SELECT * FROM push_subscriptions WHERE userid = 'X'`
- **Sintomo**: Log `[NotificationManager] No subscriptions found for user X`
- **Fix**: Verificare registrazione subscription e cleanup automatico
- **Stato DB**: 32 subscription totali, 8 utenti unici ✅

### **3. Job Non Eseguiti** 🟡 **MEDIO**
- **Impatto**: **NOTIFICHE AUTOMATICHE NON PARTONO**
- **Verifica**: Log `[JobMetrics]` nei log backend
- **Sintomo**: Nessun log `[JobMetrics] Post-appointment job started`
- **Fix**: Verificare inizializzazione `notificationManager` e `setInterval`

### **4. Tracking Errato** 🟡 **MEDIO**
- **Impatto**: **DUPLICATI O NOTIFICHE SALTATE**
- **Verifica**: Query `push_notifications_sent` per appuntamento/lead
- **Sintomo**: Log `[DEBUG_PUSH] Appointment X already sent: true` (anche se non inviata)
- **Fix**: Verificare logica `isNotificationSent()` e `markNotificationSent()`

### **5. Utente Non Esiste** 🟡 **MEDIO**
- **Impatto**: **NOTIFICA NON INVIATA PER UTENTE SPECIFICO**
- **Verifica**: Query `SELECT * FROM app_users WHERE id = 'X'`
- **Sintomo**: Log `[NotificationManager] User not found: X`
- **Fix**: Verificare integrità referenziale

---

## 📋 **CHECKLIST VERIFICA IMMEDIATA**

### **🔴 CRITICO - Verifica 1: VAPID Keys**
- [ ] `VAPID_PUBLIC_KEY` presente in variabili ambiente Render
- [ ] `VAPID_PRIVATE_KEY` presente in variabili ambiente Render
- [ ] Keys valide e non scadute
- [ ] `webpush` module inizializzato correttamente
- [ ] Log `[BP] VAPID keys configured successfully` presente

### **🔴 CRITICO - Verifica 2: Subscription**
- [ ] Almeno una subscription per utente attivo
- [ ] Subscription non scadute (`lastseen` recente, ultimi 7 giorni)
- [ ] Endpoint subscription valido (non 410/404)
- [ ] Keys subscription (`p256dh`, `auth`) presenti
- [ ] Query `SELECT COUNT(*) FROM push_subscriptions` > 0

### **🟡 MEDIO - Verifica 3: Job Esecuzione**
- [ ] Log `[JobMetrics] Post-appointment job started` ogni 7 minuti
- [ ] Log `[JobMetrics] Vendite riordini job started` ogni 7 minuti
- [ ] Log `[JobMetrics] Subscription cleanup started` ogni 4 ore
- [ ] Nessun errore nei log job
- [ ] `notificationManager` inizializzato in `server.js`

### **🟡 MEDIO - Verifica 4: Query Database**
- [ ] Query `appointments` trova appuntamenti vendita recenti (ultimi 7 giorni)
- [ ] Query `vendite_riordini` trova vendite con `data_feedback = oggi`
- [ ] Query `push_subscriptions` trova subscription per utenti
- [ ] Query `push_notifications_sent` mostra tracking corretto
- [ ] Nessun errore query Supabase

### **🟡 MEDIO - Verifica 5: NotificationManager**
- [ ] `notificationManager` inizializzato in `server.js` (riga ~1995)
- [ ] `notificationManager` inizializzato in `routes/leads.js` (riga 8-21)
- [ ] Nessun errore durante inizializzazione
- [ ] Funzioni esportate disponibili (`processPostAppointmentNotifications`, ecc.)

---

## 🎯 **PRIORITÀ INTERVENTI**

### **🔴 PRIORITÀ 1 - CRITICO**
1. **Verificare VAPID Keys** - Se mancanti, tutte le notifiche falliscono
2. **Verificare Subscription** - Se mancanti, notifiche non consegnate
3. **Verificare Job Post-Appointment** - Se non eseguiti, notifiche automatiche non partono

### **🟡 PRIORITÀ 2 - MEDIO**
4. **Verificare Query Database** - Se falliscono, job non trovano dati
5. **Verificare Tracking** - Se errato, duplicati o notifiche saltate
6. **Verificare NotificationManager** - Se non inizializzato, job falliscono

### **🟢 PRIORITÀ 3 - BASSO**
7. **Verificare Lead Assignment** - Funziona, nessun intervento necessario
8. **Verificare Frontend Banner** - Funziona, nessun intervento necessario

---

## 📊 **STATO ATTUALE DATABASE**

### **Subscription**
- **Totali**: 32 subscription
- **Utenti unici**: 8 utenti
- **Status**: ✅ Subscription presenti

### **Tracking Notifiche**
- **`post_sale`**: 23 notifiche, ultima: **2025-11-06 16:34** ⚠️ (4 giorni fa)
- **`post_nncf`**: 18 notifiche, ultima: **2025-11-10 14:36** ✅ (oggi)
- **`lead-assignment`**: 5 notifiche, ultima: **2025-11-10 15:07** ✅ (oggi)
- **`vendite-feedback`**: 1 notifica, ultima: **2025-11-04 12:43** ⚠️ (6 giorni fa)

### **Problema Principale**
**`post_sale` notifiche ferme da 4 giorni** - Questo è il problema principale da risolvere.

---

## 🔧 **PROSSIMI PASSI**

1. ✅ Verificare VAPID keys in variabili ambiente Render
2. ✅ Verificare subscription per utenti con appuntamenti vendita recenti
3. ✅ Verificare log job `[JobMetrics] Post-appointment` per vedere se vengono eseguiti
4. ✅ Verificare query `appointments` per vedere se trova appuntamenti vendita recenti
5. ✅ Verificare log `[DEBUG_PUSH]` per vedere dettagli esecuzione job

---

**Documento creato**: 2025-11-10  
**Versione**: 1.0

