# 🔒 ANALISI SICUREZZA - NOTIFICHE PUSH E DESTINATARI

**Data**: 2025-11-10  
**Status**: 🔴 **PROBLEMI CRITICI IDENTIFICATI**  
**Priorità**: CRITICA

---

## 🚨 **PROBLEMI CRITICI IDENTIFICATI**

### **PROBLEMA 1: Query Appuntamenti NON Filtra per UserId** 🔴 CRITICO

**File**: `backend/lib/notification-manager.js` - `processPostAppointmentNotifications()`

**Codice Problematico:**
```javascript
const { data: appointments, error } = await supabase
  .from('appointments')
  .select('id,userid,client,type,end_time,salepromptanswered,nncfpromptanswered,nncf')
  .eq('type', 'vendita')
  .gte('end_time', sevenDaysAgo)
  .lte('end_time', now)
  .limit(100)
  .order('end_time', { ascending: false });
```

**Problema:**
- ❌ La query recupera **TUTTI** gli appuntamenti di tipo 'vendita' degli ultimi 7 giorni
- ❌ **NON filtra per userid** - potrebbe processare appuntamenti di tutti gli utenti
- ⚠️ Anche se poi usa `appointment.userid` per inviare, c'è rischio se:
  - Il backend usa **service role key** (bypassa RLS)
  - La tabella `appointments` **NON ha RLS** (verificato: 0 policies)
  - Un utente malintenzionato potrebbe modificare il codice per inviare a utenti sbagliati

**Impatto:**
- 🔴 **ALTO**: Potenziale invio di notifiche a utenti sbagliati
- 🔴 **ALTO**: Violazione privacy (accesso a dati di altri utenti)
- 🔴 **ALTO**: Nessuna protezione a livello database

**Soluzione:**
```javascript
// ✅ CORRETTO: Filtrare per userid se processiamo per utente specifico
// OPPURE: Processare in batch per utente
const { data: appointments, error } = await supabase
  .from('appointments')
  .select('id,userid,client,type,end_time,salepromptanswered,nncfpromptanswered,nncf')
  .eq('type', 'vendita')
  .gte('end_time', sevenDaysAgo)
  .lte('end_time', now)
  // ✅ AGGIUNGERE: Filtro per userid se processiamo per utente specifico
  // .eq('userid', specificUserId) // Se processiamo per utente specifico
  .limit(100)
  .order('end_time', { ascending: false });
```

**NOTA**: Se il processo è intenzionalmente globale (processa tutti gli utenti), allora è OK, MA:
- ✅ Deve essere eseguito solo da service role (non da utenti)
- ✅ Deve usare `appointment.userid` per inviare (già fatto)
- ✅ Deve avere logging per audit trail
- ⚠️ **PROBLEMA**: Tabella `appointments` non ha RLS - chiunque con service role può vedere tutti gli appuntamenti

---

### **PROBLEMA 2: Lead Notifications Usa File JSON Locale** 🔴 CRITICO

**File**: `backend/routes/leads.js` - `sendLeadAssignmentNotification()`

**Codice Problematico:**
```javascript
// Recupera le subscription del consulente
try {
  const db = await readJSON("push_subscriptions.json");
  const subs = (db.subs || db.subscriptions || [])
    .filter(s => String(s.userId || '') === String(consultantId))
    .map(s => s.subscription || { endpoint: s.endpoint, keys: (s.keys || {}) })
    .filter(x => x && x.endpoint);
```

**Problemi:**
1. ❌ Usa file JSON locale invece di Supabase
2. ❌ Filtro fatto in memoria (non sicuro)
3. ❌ Nessuna RLS protection
4. ❌ Se file JSON viene compromesso, potrebbe inviare a utenti sbagliati
5. ❌ Nessuna validazione che `consultantId` sia valido

**Impatto:**
- 🔴 **CRITICO**: Potenziale invio a utenti sbagliati se file JSON è compromesso
- 🔴 **CRITICO**: Nessuna protezione database
- 🔴 **CRITICO**: Nessuna validazione input

**Soluzione:**
```javascript
// ✅ CORRETTO: Usare Supabase con filtro userid
const { data: subscriptions, error } = await supabase
  .from('push_subscriptions')
  .select('*')
  .eq('userid', consultantId); // ✅ Filtro a livello database

if (error) {
  console.error('Error fetching subscriptions:', error);
  return;
}

if (!subscriptions || subscriptions.length === 0) {
  productionLogger.debug(`No push subscriptions found for consultant ${consultantId}`);
  return;
}

// ✅ Validazione: Verifica che consultantId esista in app_users
const { data: consultant, error: consultantError } = await supabase
  .from('app_users')
  .select('id, name, email')
  .eq('id', consultantId)
  .single();

if (consultantError || !consultant) {
  productionLogger.error('Invalid consultant ID:', consultantId);
  return;
}
```

---

### **PROBLEMA 3: Nessuna RLS su `push_subscriptions`** 🔴 CRITICO

**Verifica Database:**
```sql
SELECT policyname FROM pg_policies WHERE tablename = 'push_subscriptions';
-- Risultato: [] (NESSUN POLICY)
```

**Problemi:**
1. ❌ Tabella `push_subscriptions` **NON ha RLS abilitato**
2. ❌ Chiunque con service role key può vedere tutte le subscription
3. ❌ Nessuna protezione a livello database

**Impatto:**
- 🔴 **CRITICO**: Accesso non autorizzato a subscription di tutti gli utenti
- 🔴 **CRITICO**: Violazione privacy
- 🔴 **CRITICO**: Potenziale invio di notifiche a utenti sbagliati

**Soluzione:**
```sql
-- ✅ Abilitare RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ✅ Policy: Utenti possono vedere solo le proprie subscription
CREATE POLICY "Users can view own subscriptions" ON push_subscriptions
  FOR SELECT USING (userid = auth.uid()::text);

-- ✅ Policy: Utenti possono inserire solo le proprie subscription
CREATE POLICY "Users can insert own subscriptions" ON push_subscriptions
  FOR INSERT WITH CHECK (userid = auth.uid()::text);

-- ✅ Policy: Utenti possono aggiornare solo le proprie subscription
CREATE POLICY "Users can update own subscriptions" ON push_subscriptions
  FOR UPDATE USING (userid = auth.uid()::text);

-- ✅ Policy: Utenti possono eliminare solo le proprie subscription
CREATE POLICY "Users can delete own subscriptions" ON push_subscriptions
  FOR DELETE USING (userid = auth.uid()::text);

-- ✅ Policy: Service role ha accesso completo (per backend)
CREATE POLICY "Service role full access" ON push_subscriptions
  FOR ALL USING (auth.role() = 'service_role');
```

---

### **PROBLEMA 4: Nessuna RLS su `appointments`** 🔴 CRITICO

**Verifica Database:**
```sql
SELECT policyname FROM pg_policies WHERE tablename = 'appointments';
-- Risultato: [] (NESSUN POLICY)
```

**Problemi:**
1. ❌ Tabella `appointments` **NON ha RLS abilitato**
2. ❌ Chiunque con service role key può vedere tutti gli appuntamenti
3. ❌ Nessuna protezione a livello database

**Impatto:**
- 🔴 **CRITICO**: Accesso non autorizzato a appuntamenti di tutti gli utenti
- 🔴 **CRITICO**: Violazione privacy
- 🔴 **CRITICO**: Potenziale modifica di appuntamenti di altri utenti

**Soluzione:**
```sql
-- ✅ Abilitare RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- ✅ Policy: Utenti possono vedere solo i propri appuntamenti
CREATE POLICY "Users can view own appointments" ON appointments
  FOR SELECT USING (userid = auth.uid()::text);

-- ✅ Policy: Admin può vedere tutti gli appuntamenti
CREATE POLICY "Admins can view all appointments" ON appointments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM app_users 
      WHERE id = auth.uid()::text 
      AND role = 'admin'
    )
  );

-- ✅ Policy: Utenti possono inserire solo i propri appuntamenti
CREATE POLICY "Users can insert own appointments" ON appointments
  FOR INSERT WITH CHECK (userid = auth.uid()::text);

-- ✅ Policy: Utenti possono aggiornare solo i propri appuntamenti
CREATE POLICY "Users can update own appointments" ON appointments
  FOR UPDATE USING (userid = auth.uid()::text);

-- ✅ Policy: Service role ha accesso completo (per backend)
CREATE POLICY "Service role full access" ON appointments
  FOR ALL USING (auth.role() = 'service_role');
```

---

### **PROBLEMA 5: `getValidSubscriptions()` Usa Service Role** ⚠️ MEDIO

**File**: `backend/lib/notification-manager.js` - `getValidSubscriptions()`

**Codice:**
```javascript
async function getValidSubscriptions(userId) {
  try {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('userid', userId); // ✅ Filtra correttamente
    
    if (error) throw error;
    
    return (data || []).map(row => ({
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth
      }
    }));
  } catch (error) {
    console.error('[NotificationManager] Error getting subscriptions:', error);
    return [];
  }
}
```

**Analisi:**
- ✅ **BUONO**: Filtra correttamente per `userid` a livello query
- ⚠️ **PROBLEMA**: Se backend usa service role key, bypassa eventuali RLS
- ⚠️ **PROBLEMA**: Nessuna validazione che `userId` sia valido
- ⚠️ **PROBLEMA**: Nessun logging per audit trail

**Soluzione:**
```javascript
async function getValidSubscriptions(userId) {
  try {
    // ✅ Validazione input
    if (!userId || typeof userId !== 'string') {
      console.error('[NotificationManager] Invalid userId:', userId);
      return [];
    }
    
    // ✅ Logging per audit
    logger.debug(`[NotificationManager] Getting subscriptions for user ${userId}`);
    
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('userid', userId); // ✅ Filtro a livello database
    
    if (error) {
      logger.error(`[NotificationManager] Error getting subscriptions for ${userId}:`, error);
      throw error;
    }
    
    // ✅ Validazione risultati
    if (!data || data.length === 0) {
      logger.debug(`[NotificationManager] No subscriptions found for user ${userId}`);
      return [];
    }
    
    logger.debug(`[NotificationManager] Found ${data.length} subscriptions for user ${userId}`);
    
    return data.map(row => ({
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth
      }
    }));
  } catch (error) {
    console.error('[NotificationManager] Error getting subscriptions:', error);
    return [];
  }
}
```

---

### **PROBLEMA 6: `sendPushNotification()` Non Valida UserId** ⚠️ MEDIO

**File**: `backend/lib/notification-manager.js` - `sendPushNotification()`

**Codice:**
```javascript
async function sendPushNotification(userId, payload, options = {}) {
  try {
    logger.debug(`Sending push to user ${userId}`);
    
    // Ottieni subscription valide per l'utente
    const subscriptions = await getValidSubscriptions(userId);
    // ...
  }
}
```

**Problemi:**
1. ⚠️ Nessuna validazione che `userId` sia valido
2. ⚠️ Nessuna verifica che `userId` esista in `app_users`
3. ⚠️ Nessun logging per audit trail completo

**Soluzione:**
```javascript
async function sendPushNotification(userId, payload, options = {}) {
  try {
    // ✅ Validazione input
    if (!userId || typeof userId !== 'string') {
      logger.error(`[NotificationManager] Invalid userId: ${userId}`);
      return { sent: 0, failed: 0, cleaned: 0 };
    }
    
    // ✅ Verifica che utente esista (opzionale ma consigliato)
    const { data: user, error: userError } = await supabase
      .from('app_users')
      .select('id, name, email')
      .eq('id', userId)
      .single();
    
    if (userError || !user) {
      logger.error(`[NotificationManager] User not found: ${userId}`, userError);
      return { sent: 0, failed: 0, cleaned: 0 };
    }
    
    // ✅ Logging per audit
    logger.info(`[NotificationManager] Sending push to user ${userId} (${user.name || user.email})`);
    logger.debug(`[NotificationManager] Payload:`, payload);
    
    // Ottieni subscription valide per l'utente
    const subscriptions = await getValidSubscriptions(userId);
    // ... resto del codice
  }
}
```

---

## ✅ **ASPETTI POSITIVI**

### **1. `push-tracking.js` Usa `req.user.id`** ✅ BUONO

**File**: `backend/routes/push-tracking.js`

**Codice:**
```javascript
router.get('/check', auth, async (req, res) => {
  const wasSent = await checkPushSent(req.user.id, appointmentId, notificationType);
  // ✅ Usa req.user.id (protetto da autenticazione)
});

router.post('/mark-sent', auth, async (req, res) => {
  const success = await markPushSent(req.user.id, appointmentId, notificationType);
  // ✅ Usa req.user.id (protetto da autenticazione)
});
```

**Analisi:**
- ✅ **BUONO**: Usa `req.user.id` (protetto da middleware `auth`)
- ✅ **BUONO**: Gli endpoint API sono protetti
- ✅ **BUONO**: Utente può vedere solo le proprie notifiche

---

### **2. `processPostAppointmentNotifications()` Usa `appointment.userid`** ✅ BUONO

**File**: `backend/lib/notification-manager.js`

**Codice:**
```javascript
const result = await sendPushNotification(appointment.userid, payload);
// ✅ Usa appointment.userid per inviare
```

**Analisi:**
- ✅ **BUONO**: Usa `appointment.userid` per inviare notifica
- ✅ **BUONO**: Notifica va al proprietario dell'appuntamento
- ⚠️ **PROBLEMA**: Ma la query iniziale non filtra per userid (vedi PROBLEMA 1)

---

## 📋 **RACCOMANDAZIONI PRIORITARIE**

### **PRIORITÀ 1: Implementare RLS su Tabelle Critiche** 🔴 CRITICO

1. **Abilitare RLS su `push_subscriptions`**
   - Policy per utenti (vedi soluzione PROBLEMA 3)
   - Policy per service role (per backend)

2. **Abilitare RLS su `appointments`**
   - Policy per utenti (vedi soluzione PROBLEMA 4)
   - Policy per admin
   - Policy per service role

3. **Verificare RLS su `push_notifications_sent`**
   - ✅ Già presente (verificato)
   - Verificare che funzioni correttamente

---

### **PRIORITÀ 2: Migrare Lead Notifications a Supabase** 🔴 CRITICO

1. **Sostituire `readJSON("push_subscriptions.json")` con query Supabase**
   - Usare `getValidSubscriptions()` da NotificationManager
   - Filtrare per `consultantId` a livello database

2. **Aggiungere validazione `consultantId`**
   - Verificare che esista in `app_users`
   - Verificare che sia valido

---

### **PRIORITÀ 3: Aggiungere Validazioni e Logging** 🟡 MEDIO

1. **Validare `userId` in tutte le funzioni**
   - Verificare che non sia null/undefined
   - Verificare che sia stringa valida
   - Verificare che esista in `app_users`

2. **Aggiungere logging per audit trail**
   - Log tutte le notifiche inviate
   - Log tutte le query eseguite
   - Log tutti gli errori

---

### **PRIORITÀ 4: Documentare Processo Globale** 🟡 MEDIO

1. **Se `processPostAppointmentNotifications()` è intenzionalmente globale:**
   - Documentare che processa tutti gli utenti
   - Documentare che usa `appointment.userid` per inviare
   - Aggiungere logging per audit trail
   - Verificare che sia eseguito solo da service role

2. **Se NON è intenzionale:**
   - Aggiungere filtro per userid nella query
   - Processare in batch per utente

---

## 🎯 **CHECKLIST CORREZIONI**

### **Database (RLS)**
- [ ] Abilitare RLS su `push_subscriptions`
- [ ] Creare policies per `push_subscriptions`
- [ ] Abilitare RLS su `appointments`
- [ ] Creare policies per `appointments`
- [ ] Verificare RLS su `push_notifications_sent`

### **Backend (Validazioni)**
- [ ] Migrare lead notifications da JSON a Supabase
- [ ] Aggiungere validazione `userId` in `sendPushNotification()`
- [ ] Aggiungere validazione `consultantId` in `sendLeadAssignmentNotification()`
- [ ] Aggiungere logging per audit trail
- [ ] Documentare processo globale `processPostAppointmentNotifications()`

### **Testing**
- [ ] Test che utente A non può vedere subscription di utente B
- [ ] Test che utente A non può vedere appuntamenti di utente B
- [ ] Test che notifiche vanno solo al destinatario corretto
- [ ] Test che lead notifications funzionano con Supabase
- [ ] Test che RLS funziona correttamente

---

## 📊 **RIEPILOGO RISCHI**

| Problema | Severità | Probabilità | Impatto | Priorità |
|----------|----------|-------------|---------|----------|
| Nessuna RLS su `push_subscriptions` | 🔴 CRITICA | 🟡 MEDIA | 🔴 ALTO | 1 |
| Nessuna RLS su `appointments` | 🔴 CRITICA | 🟡 MEDIA | 🔴 ALTO | 1 |
| Lead notifications usa JSON | 🔴 CRITICA | 🟡 MEDIA | 🔴 ALTO | 2 |
| Query appuntamenti non filtra userid | 🟡 MEDIA | 🟢 BASSA | 🟡 MEDIO | 3 |
| Nessuna validazione userId | 🟡 MEDIA | 🟢 BASSA | 🟡 MEDIO | 4 |

---

**STATUS ATTUALE:**
- 🔴 **PROBLEMI CRITICI IDENTIFICATI**
- ⏳ **CORREZIONI NECESSARIE PRIMA DI PRODUZIONE**
- ⚠️ **RISCHIO ALTO DI VIOLAZIONE PRIVACY**

