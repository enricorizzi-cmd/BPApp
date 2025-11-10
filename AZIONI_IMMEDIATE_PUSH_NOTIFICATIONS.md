# 🚨 AZIONI IMMEDIATE - PUSH NOTIFICATIONS

**Data**: 2025-11-10  
**Priorità**: 🔴 **CRITICO**

---

## 🔴 **PROBLEMA PRINCIPALE IDENTIFICATO**

### **Utente Senza Subscription**
- **UserID**: `kl6792wrwzu1x8gl`
- **Appuntamento**: `fhilvfmm76u613t8` (2025-11-07 15:30)
- **Problema**: Utente **NON HA SUBSCRIPTION** registrate
- **Impatto**: Notifiche **NON POSSONO ESSERE INVIATE** a questo utente

---

## ✅ **AZIONI IMMEDIATE**

### **1. Verificare VAPID Keys in Render** 🔴 **CRITICO**

**Cosa fare**:
1. Aprire dashboard Render: https://dashboard.render.com/web/srv-d2rds26r433s73fhcn60
2. Andare su **Environment** tab
3. Verificare presenza di:
   - `VAPID_PUBLIC_KEY` (deve essere presente)
   - `VAPID_PRIVATE_KEY` (deve essere presente)
4. Se mancanti:
   - Generare nuove keys con: `npx web-push generate-vapid-keys`
   - Aggiungere come variabili ambiente in Render

**Verifica log backend**:
- Cercare: `[BP] VAPID keys configured successfully`
- Se mancante: `[BP] VAPID keys not configured - push notifications disabled`

---

### **2. Verificare Log Job Backend** 🔴 **CRITICO**

**Cosa fare**:
1. Aprire dashboard Render: https://dashboard.render.com/web/srv-d2rds26r433s73fhcn60
2. Andare su **Logs** tab
3. Cercare nei log:
   - `[JobMetrics] Post-appointment job started`
   - `[JobMetrics] Post-appointment job completed`
   - `[DEBUG_SCANSIONE] Scanning appointments`
   - `[DEBUG_PUSH] Processing appointment`

**Cosa verificare**:
- Job eseguiti ogni 7 minuti? ✅
- Errori durante esecuzione? ❌
- Appuntamenti trovati? ✅
- Notifiche inviate? ✅

**Se job non eseguiti**:
- Verificare inizializzazione `notificationManager` in `server.js`
- Verificare che `setInterval` sia attivo
- Verificare errori durante avvio server

---

### **3. Risolvere Utente Senza Subscription** 🔴 **CRITICO**

**UserID**: `kl6792wrwzu1x8gl`

**Cosa fare**:
1. **Verificare registrazione subscription**:
   - Utente deve aprire applicazione
   - Browser deve chiedere permesso notifiche
   - Utente deve accettare
   - `push-client.js` deve registrare subscription

2. **Verificare endpoint subscription**:
   - Testare `POST /api/push/subscribe` con utente autenticato
   - Verificare che subscription venga salvata in `push_subscriptions`

3. **Verificare frontend**:
   - `frontend/lib/push-client.js` viene eseguito?
   - Service Worker registrato?
   - Permesso notifiche concesso?

**Query verifica**:
```sql
SELECT * FROM push_subscriptions WHERE userid = 'kl6792wrwzu1x8gl';
```

**Risultato atteso**: Almeno 1 subscription

---

### **4. Verificare Query Appuntamenti** 🟡 **MEDIO**

**Query test**:
```sql
SELECT a.id, a.userid, a.client, a.end_time, a.salepromptanswered, a.nncfpromptanswered, a.nncf
FROM appointments a
WHERE a.type = 'vendita'
  AND a.end_time::timestamp >= (NOW() - INTERVAL '7 days')::timestamp
  AND a.end_time::timestamp <= NOW()::timestamp
  AND (
    (a.nncf = false AND (a.salepromptanswered = false OR a.salepromptanswered IS NULL))
    OR
    (a.nncf = true AND (a.nncfpromptanswered = false OR a.nncfpromptanswered IS NULL))
  )
ORDER BY a.end_time DESC;
```

**Risultato atteso**: Appuntamenti vendita recenti non ancora notificati

**Se query non trova appuntamenti**:
- Verificare che ci siano appuntamenti vendita recenti
- Verificare che `salepromptanswered`/`nncfpromptanswered` siano `false` o `NULL`
- Verificare che `end_time` sia nel range corretto

---

### **5. Verificare NotificationManager** 🟡 **MEDIO**

**Cosa verificare**:
1. **Inizializzazione** (`server.js` riga 2020-2025):
   ```javascript
   const notificationManager = require('./lib/notification-manager')({ 
     supabase, 
     webpush, 
     VAPID_PUBLIC_KEY, 
     VAPID_PRIVATE_KEY 
   });
   ```

2. **Log inizializzazione**:
   - Cercare: `[BP] Ready - WebPush:✓ Supabase:✓ Notifications:✓`
   - Se mancante: `[BP] NotificationManager not properly initialized`

3. **Funzioni disponibili**:
   - `processPostAppointmentNotifications()` disponibile?
   - `sendPushNotification()` disponibile?
   - `isNotificationSent()` disponibile?

**Se non inizializzato**:
- Verificare errori durante `require('./lib/notification-manager')`
- Verificare che `webpush`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` siano disponibili
- Verificare log errori durante avvio server

---

## 📊 **CHECKLIST AZIONI**

### **🔴 CRITICO**
- [ ] Verificare VAPID keys in Render (variabili ambiente)
- [ ] Verificare log job backend Render
- [ ] Risolvere utente senza subscription (`kl6792wrwzu1x8gl`)

### **🟡 MEDIO**
- [ ] Verificare query appuntamenti (test Supabase)
- [ ] Verificare NotificationManager (log inizializzazione)

---

## 🎯 **RISULTATO ATTESO**

Dopo aver completato le azioni:

1. ✅ **VAPID keys presenti** → Notifiche possono essere inviate
2. ✅ **Job eseguiti correttamente** → Notifiche automatiche partono
3. ✅ **Subscription presenti per tutti gli utenti** → Notifiche possono essere consegnate
4. ✅ **Query trova appuntamenti** → Job ha dati da processare
5. ✅ **NotificationManager inizializzato** → Funzioni disponibili

---

## 📝 **NOTE**

- **Problema principale**: Utente `kl6792wrwzu1x8gl` senza subscription
- **Post-sale notifiche ferme**: Potrebbe essere normale se tutti gli appuntamenti hanno `salepromptanswered=true`
- **Job esecuzione**: Necessaria verifica log Render per confermare

---

**Documento creato**: 2025-11-10  
**Versione**: 1.0  
**Status**: 🔴 **AZIONI IMMEDIATE NECESSARIE**

