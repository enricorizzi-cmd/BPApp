# 🎯 PIANO UNIFICATO - CORREZIONI PUSH NOTIFICATIONS E BANNER

**Data**: 2025-11-10  
**Status**: 📋 **PIANO COMPLETO** - Tutte le correzioni allineate  
**Project ID**: `bzvdbmofetujylvgcmqx`

---

## 📊 **VERIFICA DATABASE COMPLETATA**

### **✅ Tabelle Verificate:**

#### **1. `appointments`** ✅ OK
**Campi Banner:**
- ✅ `salepromptanswered` (boolean, default: false) - **OK**
- ✅ `nncfpromptanswered` (boolean, default: false) - **OK**
- ✅ `salepromptsnoozeduntil` (text, nullable) - **OK**
- ✅ `nncfpromptsnoozeduntil` (text, nullable) - **OK**
- ✅ `nncf` (boolean, default: false) - **OK**
- ✅ `end_time` (text, nullable) - **OK** (formato ISO string)

**Record**: 320 appointments

---

#### **2. `push_subscriptions`** ✅ OK
**Campi:**
- ✅ `userid` (text, NOT NULL) - **OK**
- ✅ `endpoint` (text, NOT NULL) - **OK**
- ✅ `p256dh` (text, NOT NULL) - **OK**
- ✅ `auth` (text, NOT NULL) - **OK**
- ✅ `lastseen` (text, nullable) - **OK** (per cleanup)

**Record**: 26 subscriptions, 8 utenti unici, 0 mai viste

---

#### **3. `push_notifications_sent`** ⚠️ PROBLEMA IDENTIFICATO
**Campi:**
- ✅ `id` (text, PK) - **OK**
- ✅ `userid` (text, NOT NULL) - **OK**
- ⚠️ `appointmentid` (text, NOT NULL) - **PROBLEMA**: Nome specifico per appuntamenti
- ✅ `notification_type` (text, NOT NULL) - **OK**
- ✅ `sent_at` (timestamptz, default: now()) - **OK**
- ✅ `delivery_status` (text, default: 'pending') - **OK**

**Problemi Identificati:**
1. ⚠️ `appointmentid` è NOT NULL ma serve anche per lead
2. ⚠️ Constraint UNIQUE su `(appointmentid, notification_type)` limita uso per lead
3. ⚠️ Manca tipo `lead-assignment` nei dati (solo 5 tipi: sale, post_sale, nncf, post_nncf, vendite-feedback)
4. ⚠️ Constraint UNIQUE esistente: `unique_appointment_notification` su `(appointmentid, notification_type)`
5. ⚠️ Indice UNIQUE esistente: `idx_push_notifications_unique` su `(userid, appointmentid, notification_type)`

**Record**: 93 notifiche, 8 utenti, 5 tipi

**Raccomandazione:**
- Opzione A: Rendere `appointmentid` nullable e rinominare in `resource_id`
- Opzione B: Aggiungere campo `lead_id` separato
- **SCELTA**: Opzione A (più flessibile)

---

#### **4. `leads`** ✅ OK
**Campi:**
- ✅ `consulente_assegnato` (text, nullable) - **OK**
- ✅ `contact_banner_answered` (boolean, default: false) - **OK**

**Record**: 23 leads

---

## 🔴 **PROBLEMI IDENTIFICATI - RIEPILOGO**

### **PROBLEMA 1: Query Backend Post-Appointment** 🔴 CRITICO
- **File**: `backend/lib/notification-manager.js`
- **Causa**: Due `.or()` separati creano condizione AND errata
- **Impatto**: Query non trova mai appuntamenti validi
- **Status**: ✅ **GIÀ CORRETTO** (modifica applicata)

### **PROBLEMA 2: Finestra Temporale** 🟡 MEDIO
- **Backend**: 2 ore → **CORRETTO** a 7 giorni
- **Frontend**: 7 giorni
- **Status**: ✅ **GIÀ CORRETTO**

### **PROBLEMA 3: Scan Frontend Disabilitato** 🟡 MEDIO
- **File**: `frontend/src/postSaleBanners.js`
- **Causa**: Scan solo al DOMContentLoaded
- **Impatto**: Banner non appaiono se pagina aperta
- **Status**: ⏳ **DA CORREGGERE**

### **PROBLEMA 4: Lead Notifications Legacy** 🔴 CRITICO
- **File**: `backend/routes/leads.js`
- **Causa**: Usa file JSON invece di Supabase
- **Impatto**: Notifiche lead non funzionano + **RISCHIO SICUREZZA**
- **Status**: ⏳ **DA CORREGGERE**

### **PROBLEMA 5: Database Schema Limite** 🟡 MEDIO
- **Tabella**: `push_notifications_sent`
- **Causa**: `appointmentid` NOT NULL limita uso per lead
- **Impatto**: Impossibile tracciare notifiche lead
- **Status**: ⏳ **DA CORREGGERE**

### **PROBLEMA 6: Nessuna RLS su `push_subscriptions`** 🔴 CRITICO ⚠️ SICUREZZA
- **Tabella**: `push_subscriptions`
- **Causa**: RLS non abilitato
- **Impatto**: Accesso non autorizzato a subscription di tutti gli utenti
- **Status**: ⏳ **DA CORREGGERE** (PRIORITÀ 1)

### **PROBLEMA 7: Nessuna RLS su `appointments`** 🔴 CRITICO ⚠️ SICUREZZA
- **Tabella**: `appointments`
- **Causa**: RLS non abilitato
- **Impatto**: Accesso non autorizzato a appuntamenti di tutti gli utenti
- **Status**: ⏳ **DA CORREGGERE** (PRIORITÀ 1)

### **PROBLEMA 8: Query Appuntamenti Non Filtra UserId** 🟡 MEDIO ⚠️ SICUREZZA
- **File**: `backend/lib/notification-manager.js`
- **Causa**: Query globale senza filtro userid
- **Impatto**: Potenziale accesso a dati di altri utenti
- **Status**: ⏳ **DA VERIFICARE** (potrebbe essere intenzionale)

---

## 📋 **PIANO UNIFICATO DI CORREZIONE**

### **FASE 0: CORREZIONI SICUREZZA CRITICHE** 🔴🔴 (Priorità MASSIMA - PRIMA DI TUTTO)

#### **0.1 Abilitare RLS su `push_subscriptions`** 🔴 CRITICO
**Obiettivo**: Proteggere subscription da accesso non autorizzato

**Azioni:**
1. Abilitare RLS sulla tabella
2. Creare policies per utenti (vedi/inserisci/aggiorna/elimina solo proprie)
3. Creare policy per service role (per backend)
4. Testare che utente A non può vedere subscription di utente B

**Migration SQL:**
```sql
-- Abilitare RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Utenti possono vedere solo le proprie subscription
CREATE POLICY "Users can view own subscriptions" ON push_subscriptions
  FOR SELECT USING (userid = (select auth.uid())::text);

-- Policy: Utenti possono inserire solo le proprie subscription
CREATE POLICY "Users can insert own subscriptions" ON push_subscriptions
  FOR INSERT WITH CHECK (userid = (select auth.uid())::text);

-- Policy: Utenti possono aggiornare solo le proprie subscription
CREATE POLICY "Users can update own subscriptions" ON push_subscriptions
  FOR UPDATE USING (userid = (select auth.uid())::text);

-- Policy: Utenti possono eliminare solo le proprie subscription
CREATE POLICY "Users can delete own subscriptions" ON push_subscriptions
  FOR DELETE USING (userid = (select auth.uid())::text);

-- Policy: Service role ha accesso completo (per backend)
CREATE POLICY "Service role full access" ON push_subscriptions
  FOR ALL USING ((select auth.role()) = 'service_role');
```

**Test:**
- Verificare che utente A non può vedere subscription di utente B
- Verificare che backend (service role) può ancora accedere
- Verificare che frontend può ancora registrare subscription

---

#### **0.2 Abilitare RLS su `appointments`** 🔴 CRITICO
**Obiettivo**: Proteggere appuntamenti da accesso non autorizzato

**Azioni:**
1. Abilitare RLS sulla tabella
2. Creare policies per utenti (vedi/inserisci/aggiorna solo propri)
3. Creare policy per admin (vedi tutti)
4. Creare policy per service role (per backend)
5. Testare che utente A non può vedere appuntamenti di utente B

**Migration SQL:**
```sql
-- Abilitare RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Policy: Utenti possono vedere solo i propri appuntamenti
CREATE POLICY "Users can view own appointments" ON appointments
  FOR SELECT USING (userid = (select auth.uid())::text);

-- Policy: Admin può vedere tutti gli appuntamenti
CREATE POLICY "Admins can view all appointments" ON appointments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM app_users 
      WHERE id = (select auth.uid())::text 
      AND role = 'admin'
    )
  );

-- Policy: Utenti possono inserire solo i propri appuntamenti
CREATE POLICY "Users can insert own appointments" ON appointments
  FOR INSERT WITH CHECK (userid = (select auth.uid())::text);

-- Policy: Utenti possono aggiornare solo i propri appuntamenti
CREATE POLICY "Users can update own appointments" ON appointments
  FOR UPDATE USING (userid = (select auth.uid())::text);

-- Policy: Service role ha accesso completo (per backend)
CREATE POLICY "Service role full access" ON appointments
  FOR ALL USING ((select auth.role()) = 'service_role');
```

**Test:**
- Verificare che utente A non può vedere appuntamenti di utente B
- Verificare che admin può vedere tutti gli appuntamenti
- Verificare che backend (service role) può ancora accedere

---

#### **0.3 Aggiungere Validazioni e Logging** 🟡 MEDIO
**Obiettivo**: Validare input e tracciare tutte le operazioni

**Azioni:**
1. Validare `userId` in `sendPushNotification()`
2. Validare `consultantId` in `sendLeadAssignmentNotification()`
3. Aggiungere logging per audit trail
4. Verificare che utente esista prima di inviare

**File**: `backend/lib/notification-manager.js`

**Codice Target:**
```javascript
async function sendPushNotification(userId, payload, options = {}) {
  try {
    // ✅ Validazione input
    if (!userId || typeof userId !== 'string') {
      logger.error(`[NotificationManager] Invalid userId: ${userId}`);
      return { sent: 0, failed: 0, cleaned: 0 };
    }
    
    // ✅ Verifica che utente esista
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
    
    // ... resto del codice esistente
  }
}
```

**Test:**
- Verificare che notifiche non vengano inviate a userId invalidi
- Verificare che logging funzioni correttamente
- Verificare che audit trail sia completo

---

### **FASE 1: CORREZIONI CRITICHE DATABASE** 🔴 (Priorità Alta)

#### **1.1 Migrazione Schema `push_notifications_sent`**
**Obiettivo**: Rendere tabella compatibile con lead notifications

**Azioni:**
1. Aggiungere campo `resource_id` (text, nullable) - generico per appuntamenti/lead
2. Rendere `appointmentid` nullable (per retrocompatibilità)
3. Aggiornare constraint UNIQUE per includere `resource_id`
4. Migrare dati esistenti: `resource_id = appointmentid` dove `appointmentid IS NOT NULL`

**Migration SQL:**
```sql
-- Step 1: Aggiungere campo resource_id
ALTER TABLE push_notifications_sent 
ADD COLUMN resource_id TEXT;

-- Step 2: Migrare dati esistenti
UPDATE push_notifications_sent 
SET resource_id = appointmentid 
WHERE appointmentid IS NOT NULL;

-- Step 3: Rendere appointmentid nullable
ALTER TABLE push_notifications_sent 
ALTER COLUMN appointmentid DROP NOT NULL;

-- Step 4: Rimuovere constraint UNIQUE esistente (CONSTRAINT, non INDEX)
ALTER TABLE push_notifications_sent 
DROP CONSTRAINT IF EXISTS unique_appointment_notification;

-- Step 5: Rimuovere indici esistenti che usano solo appointmentid
-- NOTA: idx_push_notifications_unique è un INDEX UNIQUE, non un CONSTRAINT
DROP INDEX IF EXISTS idx_push_notifications_unique;
DROP INDEX IF EXISTS idx_push_notifications_appt_type;

-- Step 6: Creare nuovo constraint UNIQUE che supporta sia appointmentid che resource_id
-- Usa COALESCE per gestire entrambi i casi
CREATE UNIQUE INDEX idx_push_notifications_unique 
ON push_notifications_sent(
  userid, 
  COALESCE(resource_id, appointmentid), 
  notification_type
);

-- Step 7: Aggiungere index per resource_id
CREATE INDEX IF NOT EXISTS idx_push_notifications_resource_id 
ON push_notifications_sent(resource_id) 
WHERE resource_id IS NOT NULL;

-- Step 8: Mantenere index per appointmentid (retrocompatibilità)
CREATE INDEX IF NOT EXISTS idx_push_notifications_appointmentid 
ON push_notifications_sent(appointmentid) 
WHERE appointmentid IS NOT NULL;
```

**Test:**
- Verificare che dati esistenti siano migrati correttamente
- Verificare che constraint funzioni per appuntamenti e lead
- Verificare che query esistenti continuino a funzionare

**Rischio**: 🟡 **MEDIO** - Modifica schema esistente
**Rollback**: Possibile (manteniamo `appointmentid` per retrocompatibilità)

---

### **FASE 2: CORREZIONI BACKEND** 🔴 (Priorità Alta)

#### **2.1 Fix Query Post-Appointment** ✅ GIÀ FATTO
**File**: `backend/lib/notification-manager.js`
**Status**: ✅ **COMPLETATO**

---

#### **2.2 Migrazione Lead Notifications a NotificationManager** 🔴 CRITICO ⚠️ SICUREZZA
**File**: `backend/routes/leads.js`

**Azioni:**
1. Importare NotificationManager
2. Sostituire `readJSON("push_subscriptions.json")` con `getValidSubscriptions()` (✅ SICUREZZA)
3. Usare `sendPushNotification()` invece di `webpush.sendNotification()` diretto
4. Aggiungere cleanup automatico subscription invalide
5. Aggiungere tracking in `push_notifications_sent` con `resource_id = leadId`
6. ✅ **VALIDARE `consultantId`** prima di inviare (verificare che esista in `app_users`)
7. ✅ **LOGGING** per audit trail

**Codice Target:**
```javascript
// In cima al file (dopo require):
let notificationManager = null;
try {
  const NotificationManagerFactory = require('../lib/notification-manager');
  notificationManager = NotificationManagerFactory({
    supabase,
    webpush,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  });
} catch (error) {
  console.error('[Leads] Error initializing NotificationManager:', error);
}

// Sostituire sendLeadAssignmentNotification():
async function sendLeadAssignmentNotification(consultantId, leadData) {
  try {
    // ✅ VALIDAZIONE INPUT
    if (!consultantId || typeof consultantId !== 'string') {
      productionLogger.error('[LeadNotification] Invalid consultantId:', consultantId);
      return;
    }
    
    // ✅ Recupera e VALIDA consulente
    const { data: consultant, error: consultantError } = await supabase
      .from('app_users')
      .select('id, name, email')
      .eq('id', consultantId)
      .single();

    if (consultantError || !consultant) {
      productionLogger.error('[LeadNotification] Consultant not found:', consultantId, consultantError);
      return;
    }
    
    // ✅ LOGGING per audit
    productionLogger.info(`[LeadNotification] Sending notification to consultant ${consultantId} (${consultant.name || consultant.email})`);

    const consultantName = consultant.name || consultant.email || 'Consulente';
    const leadName = leadData.nomeLead || leadData.nome_lead || '';
    const message = `Ehi ${consultantName}, ti abbiamo assegnato il lead "${leadName}" da contattare entro 24h!`;
    
    // ✅ Usa NotificationManager
    if (notificationManager) {
      const payload = {
        title: "Battle Plan - Nuovo Lead Assegnato",
        body: message,
        url: "/#leads",
        tag: "lead-assignment",
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: {
          leadId: leadData.id || leadData.id_lead,
          leadName: leadName,
          type: 'lead-assignment',
          url: "/#leads"
        }
      };
      
      const result = await notificationManager.sendPushNotification(consultantId, payload);
      console.log(`[LeadNotification] Sent to ${consultantId}: sent=${result.sent}, failed=${result.failed}, cleaned=${result.cleaned}`);
      
      // ✅ Tracking con resource_id
      if (result.sent > 0 && (leadData.id || leadData.id_lead)) {
        await notificationManager.markNotificationSent(
          consultantId,
          leadData.id || leadData.id_lead,
          'lead-assignment',
          null, // device_id
          true  // use_resource_id = true
        );
      }
    } else {
      // Fallback legacy (per compatibilità)
      productionLogger.warn('[LeadNotification] NotificationManager not available');
      // ... codice legacy esistente ...
    }
  } catch (error) {
    console.error('Error in sendLeadAssignmentNotification:', error);
  }
}
```

**Modifiche NotificationManager:**
```javascript
// Aggiungere parametro use_resource_id a markNotificationSent():
async function markNotificationSent(userId, resourceId, notificationType, deviceId = null, useResourceId = false) {
  try {
    const trackingData = {
      id: `${resourceId}_${notificationType}`,
      userid: userId,
      resource_id: useResourceId ? resourceId : null,
      appointmentid: useResourceId ? null : resourceId,
      notification_type: notificationType,
      device_id: deviceId,
      delivery_status: 'sent',
      sent_at: new Date().toISOString(),
      createdat: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('push_notifications_sent')
      .upsert(trackingData, { onConflict: 'id' });
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[NotificationManager] Error marking notification:', error);
    return false;
  }
}
```

**Test:**
- Verificare che notifiche lead vengano inviate
- Verificare che subscription invalide vengano rimosse
- Verificare che tracking funzioni con `resource_id`

---

#### **2.3 Aggiornare isNotificationSent per Supportare Resource ID**
**File**: `backend/lib/notification-manager.js`

**Azioni:**
1. Aggiornare `isNotificationSent()` per controllare sia `appointmentid` che `resource_id`
2. Supportare tipo `lead-assignment`

**Codice Target:**
```javascript
async function isNotificationSent(resourceId, notificationType) {
  try {
    // Controlla sia appointmentid che resource_id
    const { data, error } = await supabase
      .from('push_notifications_sent')
      .select('id')
      .eq('notification_type', notificationType)
      .or(`appointmentid.eq.${resourceId},resource_id.eq.${resourceId}`)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  } catch (error) {
    console.error('[NotificationManager] Error checking notification:', error);
    return true; // Fail-safe
  }
}
```

---

### **FASE 3: CORREZIONI FRONTEND** 🟡 (Priorità Media)

#### **3.1 Riabilitare Scan Periodico** 🟡 IMPORTANTE
**File**: `frontend/src/postSaleBanners.js`

**Azioni:**
1. Riabilitare scan periodico (ogni 5 minuti)
2. Riabilitare scan su `visibilitychange`
3. Aggiungere cleanup listeners su navigazione SPA
4. Aggiungere caching (5 minuti) per ridurre query

**Codice Target:**
```javascript
// Dopo riga 737 (dopo scan() iniziale):

// Cache per ridurre query
let _lastScanTime = 0;
let _lastScanData = null;
const SCAN_CACHE_MS = 5 * 60 * 1000; // 5 minuti

async function scanWithCache(){
  const now = Date.now();
  if (_lastScanData && (now - _lastScanTime) < SCAN_CACHE_MS) {
    dbg('Using cached scan data');
    processScanData(_lastScanData);
    return;
  }
  
  try {
    const r = await GET('/api/appointments');
    _lastScanData = r;
    _lastScanTime = now;
    processScanData(r);
  } catch(e) {
    dbg('Scan error:', e);
  }
}

function processScanData(r) {
  // ... logica scan esistente ...
}

// Periodic scan (ogni 5 minuti come fallback)
let scanInterval = null;
try {
  scanInterval = setInterval(function(){ 
    if (!document.hidden && window.getUser && window.getUser()) {
      scanWithCache(); 
    }
  }, 5*60*1000);
} catch(_){ }

// Scan quando tab diventa visibile
try {
  document.addEventListener('visibilitychange', function(){ 
    if(!document.hidden && window.getUser && window.getUser()) {
      setTimeout(scanWithCache, 50); 
    }
  });
} catch(_){ }

// Cleanup su navigazione SPA
try {
  window.addEventListener('beforeunload', function() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
  });
} catch(_){ }
```

**Test:**
- Verificare che banner appaiano anche con pagina aperta
- Verificare che scan non causi performance issues
- Verificare che cache funzioni correttamente

---

#### **3.2 Aggiungere Check Push Tracking PRIMA di Banner** 🔴 CRITICO
**File**: `frontend/src/postSaleBanners.js`

**Azioni:**
1. Controllare `pushSent()` PRIMA di `enqueueBanner()`
2. Evitare duplicati tra backend e frontend

**Codice Target:**
```javascript
// In scan(), prima di enqueueBanner():
if (appt.nncf){
  // ... controlli esistenti ...
  
  // ✅ CONTROLLO CRITICO: Verifica push già inviata PRIMA di mostrare banner
  const pushAlreadySent = await pushSent(appt.id, KIND_NNCF);
  if (pushAlreadySent) {
    dbg('Push already sent, skipping banner for', appt.id);
    return; // Non mostrare banner se push già inviata
  }
  
  dbg('Triggering NNCF push and banner for', appt.id);
  triggerPush(KIND_NNCF, appt);
  markPending(appt.id, KIND_NNCF);
  enqueueBanner(bannerNNCF(appt));
} else {
  // ... stesso per SALE ...
  
  const pushAlreadySent = await pushSent(appt.id, KIND_SALE);
  if (pushAlreadySent) {
    dbg('Push already sent, skipping banner for', appt.id);
    return;
  }
  
  dbg('Triggering SALE push and banner for', appt.id);
  triggerPush(KIND_SALE, appt);
  markPending(appt.id, KIND_SALE);
  enqueueBanner(bannerSale(appt));
}
```

**Test:**
- Verificare che banner non appaiano se push già inviata
- Verificare che non ci siano duplicati

---

### **FASE 4: MIGLIORAMENTI E OTTIMIZZAZIONI** 🟢 (Priorità Bassa)

#### **4.1 Rate Limiting Notifiche**
**File**: `backend/lib/notification-manager.js`

**Azioni:**
1. Aggiungere rate limiting: max 1 notifica per resource ogni 24h
2. Exponential backoff su errori

---

#### **4.2 Migliorare Logging**
**File**: Vari

**Azioni:**
1. Logging strutturato per tutte le notifiche
2. Metriche per monitoraggio

---

#### **4.3 Standardizzare Tipi Notifiche**
**File**: Vari

**Azioni:**
1. Documentare mapping tipi
2. Costanti condivise

---

## ✅ **CHECKLIST IMPLEMENTAZIONE**

### **FASE 1: Database** 🔴 CRITICO
- [ ] **1.1** Migrazione schema `push_notifications_sent`
  - [ ] Aggiungere campo `resource_id`
  - [ ] Rendere `appointmentid` nullable
  - [ ] Aggiornare constraint UNIQUE
  - [ ] Migrare dati esistenti
  - [ ] Test retrocompatibilità

### **FASE 2: Backend** 🔴 CRITICO
- [ ] **2.1** Fix query post-appointment ✅ **GIÀ FATTO**
- [ ] **2.2** Migrazione lead notifications
  - [ ] Import NotificationManager
  - [ ] Sostituire readJSON con getValidSubscriptions
  - [ ] Usare sendPushNotification
  - [ ] Aggiungere tracking con resource_id
  - [ ] Test end-to-end
- [ ] **2.3** Aggiornare isNotificationSent
  - [ ] Supportare resource_id
  - [ ] Supportare lead-assignment
  - [ ] Test

### **FASE 3: Frontend** 🟡 IMPORTANTE
- [ ] **3.1** Riabilitare scan periodico
  - [ ] Scan ogni 5 minuti
  - [ ] Scan su visibilitychange
  - [ ] Caching 5 minuti
  - [ ] Cleanup listeners
  - [ ] Test performance
- [ ] **3.2** Check push tracking PRIMA banner
  - [ ] Controllo pushSent() prima di enqueueBanner()
  - [ ] Test duplicati

### **FASE 4: Miglioramenti** 🟢 OPZIONALE
- [ ] **4.1** Rate limiting
- [ ] **4.2** Logging migliorato
- [ ] **4.3** Standardizzazione tipi

---

## 🎯 **ORDINE DI IMPLEMENTAZIONE RACCOMANDATO**

### **Sprint 0: SICUREZZA CRITICA** (1 giorno) 🔴🔴 PRIORITÀ MASSIMA
1. ✅ FASE 0.1: Abilitare RLS su `push_subscriptions`
2. ✅ FASE 0.2: Abilitare RLS su `appointments`
3. ✅ FASE 0.3: Aggiungere validazioni e logging
4. ✅ Test sicurezza (utente A non può vedere dati di utente B)

### **Sprint 1: Database + Backend Lead** (1-2 giorni)
1. ✅ FASE 1.1: Migrazione schema database
2. ✅ FASE 2.2: Migrazione lead notifications (include validazioni sicurezza)
3. ✅ FASE 2.3: Aggiornare isNotificationSent
4. ✅ Test end-to-end lead notifications

### **Sprint 2: Frontend Banner** (1 giorno)
1. ✅ FASE 3.2: Check push tracking PRIMA banner (CRITICO per duplicati)
2. ✅ FASE 3.1: Riabilitare scan periodico
3. ✅ Test end-to-end banner

### **Sprint 3: Miglioramenti** (opzionale)
1. ✅ FASE 4: Rate limiting, logging, standardizzazione

---

## 📊 **METRICHE DI SUCCESSO**

### **Dopo FASE 1:**
- ✅ Tabella `push_notifications_sent` supporta lead
- ✅ Dati esistenti migrati correttamente
- ✅ Query esistenti continuano a funzionare

### **Dopo FASE 2:**
- ✅ Notifiche lead vengono inviate
- ✅ Subscription invalide vengono rimosse
- ✅ Tracking funziona per lead
- ✅ Backend processa appuntamenti correttamente

### **Dopo FASE 3:**
- ✅ Banner appaiono anche con pagina aperta
- ✅ Nessun duplicato banner/push
- ✅ Performance accettabile (cache funziona)

### **Dopo FASE 4:**
- ✅ Rate limiting attivo
- ✅ Logging completo
- ✅ Tipi standardizzati

---

## 🚨 **RISCHI E MITIGAZIONI**

### **Rischio 1: Migrazione Database**
**Mitigazione:**
- Mantenere `appointmentid` per retrocompatibilità
- Migrazione incrementale (non distruttiva)
- Test su branch di sviluppo

### **Rischio 2: Duplicati Notifiche**
**Mitigazione:**
- Check `pushSent()` PRIMA di banner (FASE 3.2)
- Tracking atomico in database
- Rate limiting (FASE 4.1)

### **Rischio 3: Performance Database**
**Mitigazione:**
- Caching frontend (FASE 3.1)
- Indici ottimizzati (già presenti)
- Monitoraggio metriche

---

## 📝 **NOTE IMPORTANTI**

1. **Retrocompatibilità**: Mantenere `appointmentid` per non rompere codice esistente
2. **Incrementale**: Implementare fase per fase, testare dopo ogni fase
3. **Rollback**: Ogni fase deve essere reversibile
4. **Monitoraggio**: Monitorare metriche dopo ogni deploy

---

## 🎯 **PROSSIMI PASSI**

1. ✅ **APPROVAZIONE**: Rivedere e approvare piano
2. ⏳ **SPRINT 1**: Implementare FASE 1 + FASE 2.2 + FASE 2.3
3. ⏳ **TEST**: Test end-to-end lead notifications
4. ⏳ **SPRINT 2**: Implementare FASE 3.1 + FASE 3.2
5. ⏳ **TEST**: Test end-to-end banner
6. ⏳ **DEPLOY**: Deploy in produzione
7. ⏳ **MONITORAGGIO**: Monitorare metriche per 1 settimana

---

**STATUS ATTUALE:**
- ✅ Verifica database completata
- ✅ Problemi identificati e documentati
- ✅ **PROBLEMI SICUREZZA CRITICI IDENTIFICATI** (vedi `ANALISI_SICUREZZA_NOTIFICHE_PUSH.md`)
- ✅ Piano unificato creato
- ⏳ **SPRINT 0 (SICUREZZA) DEVE ESSERE PRIMA DI TUTTO**
- ⏳ In attesa di approvazione per implementazione

---

## ⚠️ **AVVISO SICUREZZA CRITICO**

**PROBLEMI SICUREZZA IDENTIFICATI:**
1. 🔴 **Nessuna RLS su `push_subscriptions`** - Accesso non autorizzato possibile
2. 🔴 **Nessuna RLS su `appointments`** - Accesso non autorizzato possibile
3. 🔴 **Lead notifications usa file JSON** - Nessuna protezione database

**RACCOMANDAZIONE:**
- ⚠️ **IMPLEMENTARE SPRINT 0 PRIMA DI QUALSIASI ALTRA COSA**
- ⚠️ **NON DEPLOYARE IN PRODUZIONE** senza correzioni sicurezza
- ⚠️ **VEDERE `ANALISI_SICUREZZA_NOTIFICHE_PUSH.md`** per dettagli completi

---

## 📊 **RIEPILOGO ESECUTIVO**

### **✅ VERIFICA DATABASE COMPLETATA**

**Tabelle Verificate:**
- ✅ `appointments`: Tutti i campi banner presenti e corretti (320 record)
- ✅ `push_subscriptions`: Struttura corretta (26 subscriptions, 8 utenti)
- ⚠️ `push_notifications_sent`: Richiede migrazione per supportare lead (93 record)
- ✅ `leads`: Campi necessari presenti (23 record)

**Problemi Database:**
1. ⚠️ `push_notifications_sent.appointmentid` NOT NULL → limita uso per lead
2. ⚠️ Constraint UNIQUE su `(appointmentid, notification_type)` → da aggiornare
3. ⚠️ Manca supporto per `resource_id` generico

**Soluzione Database:**
- Aggiungere campo `resource_id` (nullable)
- Rendere `appointmentid` nullable (retrocompatibilità)
- Aggiornare constraint UNIQUE per supportare entrambi

---

### **🔴 PROBLEMI IDENTIFICATI (8 Totali - 3 SICUREZZA CRITICI)**

1. **Query Backend Post-Appointment** 🔴 CRITICO
   - Status: ✅ **GIÀ CORRETTO** (modifica applicata)

2. **Lead Notifications Legacy** 🔴 CRITICO
   - Status: ⏳ **DA CORREGGERE** (FASE 2.2)

3. **Database Schema Limite** 🟡 MEDIO
   - Status: ⏳ **DA CORREGGERE** (FASE 1.1)

4. **Scan Frontend Disabilitato** 🟡 MEDIO
   - Status: ⏳ **DA CORREGGERE** (FASE 3.1)

5. **Duplicati Notifiche/Banner** 🔴 CRITICO
   - Status: ⏳ **DA CORREGGERE** (FASE 3.2)

---

### **📋 PIANO IMPLEMENTAZIONE (3 Sprint)**

**SPRINT 0: SICUREZZA CRITICA** 🔴🔴 (1 giorno) - **PRIMA DI TUTTO**
- FASE 0.1: RLS su `push_subscriptions`
- FASE 0.2: RLS su `appointments`
- FASE 0.3: Validazioni e logging

**SPRINT 1: Database + Backend Lead** (1-2 giorni)
- FASE 1.1: Migrazione schema database
- FASE 2.2: Migrazione lead notifications (include sicurezza)
- FASE 2.3: Aggiornare isNotificationSent

**SPRINT 2: Frontend Banner** (1 giorno)
- FASE 3.2: Check push tracking PRIMA banner (CRITICO)
- FASE 3.1: Riabilitare scan periodico

**SPRINT 3: Miglioramenti** (opzionale)
- FASE 4: Rate limiting, logging, standardizzazione

---

### **🎯 RISULTATO ATTESO**

Dopo implementazione completa:
- ✅ Banner post-vendita funzionano
- ✅ Banner post-NNCF funzionano
- ✅ Banner vendite riordini funzionano
- ✅ Notifiche push appuntamenti funzionano
- ✅ Notifiche push lead funzionano
- ✅ Nessun duplicato banner/push
- ✅ Performance accettabile

