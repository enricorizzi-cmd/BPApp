# 🔴 PROBLEMA CRITICO - NOTIFICHE PUSH LEAD NON FUNZIONANO

**Data**: 2025-11-10  
**Status**: 🔴 **CRITICO** - Notifiche lead non vengono ricevute dagli utenti

---

## 📊 **RIEPILOGO PROBLEMA**

**Sintomi:**
- ❌ Utenti non ricevono notifiche push quando viene assegnato un lead
- ❌ Notifiche lead non funzionano anche se VAPID keys configurate
- ✅ Notifiche appuntamenti funzionano correttamente
- ✅ Notifiche manuali funzionano correttamente

**Causa Root Identificata:**
- **Lead notifications** usano sistema **LEGACY** (file JSON)
- **Appointment notifications** usano sistema **MODERNO** (Supabase)
- **Incompatibilità** tra i due sistemi

---

## 🔍 **ANALISI DETTAGLIATA**

### **1. PROBLEMA: SISTEMA DOPPIO SUBSCRIPTIONS** 🔴 CRITICO

**Lead Notifications** (`backend/routes/leads.js` righe 44-55):
```javascript
// ❌ USA FILE JSON LEGACY:
const db = await readJSON("push_subscriptions.json");
const subs = (db.subs || db.subscriptions || [])
  .filter(s => String(s.userId || '') === String(consultantId))
  .map(s => s.subscription || { endpoint: s.endpoint, keys: (s.keys || {}) })
  .filter(x => x && x.endpoint);
```

**Appointment Notifications** (`backend/lib/notification-manager.js` righe 53-73):
```javascript
// ✅ USA SUPABASE:
async function getValidSubscriptions(userId) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('userid', userId);
  // ...
}
```

**Impatto:**
- ❌ Se subscription è solo in Supabase → lead notifications non la trovano
- ❌ Se subscription è solo in JSON → appointment notifications non la trovano
- ❌ Subscription duplicate/inconsistenti
- ❌ Notifiche lead falliscono silenziosamente

---

### **2. PROBLEMA: NESSUN CLEANUP SUBSCRIPTION INVALIDE** 🔴 CRITICO

**Lead Notifications:**
```javascript
// ❌ NESSUN CLEANUP:
await Promise.all(subs.map(async (sub) => {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (error) {
    console.error(`Failed to send:`, error.message);
    // ❌ Subscription invalida NON viene rimossa!
  }
}));
```

**Appointment Notifications:**
```javascript
// ✅ CLEANUP AUTOMATICO:
catch (error) {
  if (error.statusCode === 410 || error.statusCode === 404) {
    await deleteInvalidSubscription(userId, sub);
    cleaned++;
  }
}
```

**Impatto:**
- ❌ Subscription scadute/invalide rimangono nel file JSON
- ❌ Tentativi ripetuti di invio a subscription morte
- ❌ Performance degradata (tentativi inutili)
- ❌ Log pieni di errori

---

### **3. PROBLEMA: NESSUN TRACKING NOTIFICHE** 🟡 MEDIO

**Lead Notifications:**
- ❌ Non traccia se notifica è stata inviata
- ❌ Non previene duplicati
- ❌ Nessun logging strutturato

**Appointment Notifications:**
- ✅ Traccia in `push_notifications_sent`
- ✅ Previene duplicati
- ✅ Logging dettagliato

**Impatto:**
- ❌ Impossibile debug perché non si sa se notifica è stata inviata
- ❌ Possibili duplicati se funzione chiamata più volte
- ❌ Nessuna metrica per monitoraggio

---

### **4. PROBLEMA: GESTIONE ERRORI DEBOLE** 🟡 MEDIO

**Lead Notifications:**
```javascript
// ❌ Errori silenziosi:
catch (error) {
  console.error(`Failed to send notification:`, error.message);
  // ❌ Non distingue tra errori temporanei e permanenti
  // ❌ Non fa retry
  // ❌ Non notifica amministratore
}
```

**Appointment Notifications:**
```javascript
// ✅ Gestione errori robusta:
catch (error) {
  failed++;
  logger.error(`Failed to send:`, error.message);
  if (error.statusCode === 410 || error.statusCode === 404) {
    await deleteInvalidSubscription(userId, sub);
  }
  // ✅ Distingue errori, fa cleanup, logging strutturato
}
```

---

## ✅ **SOLUZIONE: MIGRARE LEAD NOTIFICATIONS A NOTIFICATIONMANAGER**

### **Correzione Necessaria:**

**File**: `backend/routes/leads.js`

**PRIMA (ERRATO):**
```javascript
async function sendLeadAssignmentNotification(consultantId, leadData) {
  // ❌ Usa file JSON legacy
  const db = await readJSON("push_subscriptions.json");
  const subs = (db.subs || db.subscriptions || [])
    .filter(s => String(s.userId || '') === String(consultantId))
    // ...
  
  // ❌ Nessun cleanup
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (error) {
      console.error(`Failed:`, error.message);
      // ❌ Subscription invalida non rimossa
    }
  }));
}
```

**DOPO (CORRETTO):**
```javascript
async function sendLeadAssignmentNotification(consultantId, leadData) {
  // ✅ Usa NotificationManager centralizzato
  const notificationManager = require('../lib/notification-manager')({
    supabase,
    webpush,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  });
  
  const consultantName = consultant.name || consultant.email || 'Consulente';
  const leadName = leadData.nomeLead || '';
  const message = `Ehi ${consultantName}, ti abbiamo assegnato il lead "${leadName}" da contattare entro 24h!`;
  
  const payload = {
    title: "Battle Plan - Nuovo Lead Assegnato",
    body: message,
    url: "/#leads",
    tag: "lead-assignment",
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: {
      leadId: leadData.id,
      leadName: leadName,
      type: 'lead-assignment',
      url: "/#leads"
    }
  };
  
  // ✅ Usa NotificationManager con cleanup automatico
  const result = await notificationManager.sendPushNotification(consultantId, payload);
  
  // ✅ Logging strutturato
  console.log(`[LeadNotification] Sent to ${consultantId}: sent=${result.sent}, failed=${result.failed}, cleaned=${result.cleaned}`);
  
  // ✅ Tracking (opzionale ma consigliato)
  if (result.sent > 0) {
    await notificationManager.markNotificationSent(
      consultantId, 
      leadData.id, 
      'lead-assignment'
    );
  }
}
```

---

## 📋 **PIANO DI CORREZIONE**

### **FASE 1: Migrazione Immediata** 🔴 CRITICO

**Azioni:**
1. ✅ Modificare `sendLeadAssignmentNotification()` per usare NotificationManager
2. ✅ Rimuovere dipendenza da `readJSON("push_subscriptions.json")`
3. ✅ Aggiungere cleanup automatico subscription invalide
4. ✅ Aggiungere logging strutturato

**File da Modificare:**
- `backend/routes/leads.js` (righe 18-80)

**Test:**
- Verificare che notifiche lead vengano inviate
- Verificare che subscription invalide vengano rimosse
- Verificare logging in produzione

---

### **FASE 2: Tracking e Monitoring** 🟡 IMPORTANTE

**Azioni:**
1. ✅ Aggiungere tracking notifiche lead in `push_notifications_sent`
2. ✅ Prevenire duplicati
3. ✅ Aggiungere metriche per monitoraggio

**Test:**
- Verificare che duplicati siano prevenuti
- Verificare che tracking funzioni correttamente

---

### **FASE 3: Validazione** 🟢 OPZIONALE

**Azioni:**
1. ✅ Test end-to-end con utenti reali
2. ✅ Monitoraggio produzione per 1 settimana
3. ✅ Verificare che tutti gli utenti ricevano notifiche

---

## 🎯 **RISPOSTA ALLA DOMANDA**

### **"Con queste verifiche e modifiche risolvi anche le notifiche push per i lead?"**

**RISPOSTA**: ⚠️ **PARZIALMENTE**

**Cosa RISOLVE:**
- ✅ Le correzioni proposte per i banner/appuntamenti **NON risolvono direttamente** le notifiche lead
- ✅ Tuttavia, **migliorano il sistema generale** di notifiche push
- ✅ Il problema dei lead è **DIVERSO** e richiede correzione specifica

**Cosa NON RISOLVE:**
- ❌ Lead notifications usano sistema legacy (file JSON)
- ❌ Non usano NotificationManager centralizzato
- ❌ Non hanno cleanup subscription invalide
- ❌ Richiedono correzione separata

**RACCOMANDAZIONE:**
1. ✅ **PRIMA**: Applicare correzioni banner/appuntamenti (FASE 1)
2. ✅ **POI**: Migrare lead notifications a NotificationManager (questa correzione)
3. ✅ **INFINE**: Test end-to-end completo

---

## 🔧 **IMPLEMENTAZIONE CORREZIONE LEAD**

### **Modifica File `backend/routes/leads.js`:**

**Aggiungere in cima al file (dopo require):**
```javascript
// Import NotificationManager
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
```

**Sostituire funzione `sendLeadAssignmentNotification()`:**
```javascript
async function sendLeadAssignmentNotification(consultantId, leadData) {
  try {
    // Recupera i dati del consulente
    const { data: consultant, error: consultantError } = await supabase
      .from('app_users')
      .select('name, email')
      .eq('id', consultantId)
      .single();

    if (consultantError || !consultant) {
      productionLogger.error('Error fetching consultant for notification:', consultantError);
      return;
    }

    const consultantName = consultant.name || consultant.email || 'Consulente';
    const leadName = leadData.nomeLead || leadData.nome_lead || '';
    
    const message = `Ehi ${consultantName}, ti abbiamo assegnato il lead "${leadName}" da contattare entro 24h!`;
    
    // ✅ Usa NotificationManager se disponibile, altrimenti fallback
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
      
      // Tracking (opzionale)
      if (result.sent > 0 && (leadData.id || leadData.id_lead)) {
        await notificationManager.markNotificationSent(
          consultantId,
          leadData.id || leadData.id_lead,
          'lead-assignment'
        );
      }
    } else {
      // Fallback legacy (per compatibilità)
      productionLogger.warn('[LeadNotification] NotificationManager not available, using legacy method');
      
      if (!webpush || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        productionLogger.debug('Push notifications not configured');
        return;
      }
      
      try {
        const db = await readJSON("push_subscriptions.json");
        const subs = (db.subs || db.subscriptions || [])
          .filter(s => String(s.userId || '') === String(consultantId))
          .map(s => s.subscription || { endpoint: s.endpoint, keys: (s.keys || {}) })
          .filter(x => x && x.endpoint);
          
        if (subs.length === 0) {
          productionLogger.debug(`No push subscriptions found for consultant ${consultantId}`);
          return;
        }
        
        const payload = {
          title: "Battle Plan - Nuovo Lead Assegnato",
          body: message,
          url: "/",
          tag: "lead-assignment"
        };
        
        await Promise.all(subs.map(async (sub) => {
          try {
            await webpush.sendNotification(sub, JSON.stringify(payload));
            console.log(`Lead assignment notification sent to consultant ${consultantId}`);
          } catch (error) {
            console.error(`Failed to send notification to consultant ${consultantId}:`, error.message);
          }
        }));
      } catch (error) {
        console.error('Error sending lead assignment notification:', error);
      }
    }
  } catch (error) {
    console.error('Error in sendLeadAssignmentNotification:', error);
  }
}
```

---

## ✅ **CHECKLIST CORREZIONE LEAD**

### **Correzioni Critiche:**
- [ ] Migrare `sendLeadAssignmentNotification()` a NotificationManager
- [ ] Rimuovere dipendenza da `readJSON("push_subscriptions.json")`
- [ ] Aggiungere cleanup automatico subscription invalide
- [ ] Test con utenti reali

### **Miglioramenti:**
- [ ] Aggiungere tracking notifiche lead
- [ ] Prevenire duplicati
- [ ] Aggiungere metriche monitoraggio

### **Validazione:**
- [ ] Test end-to-end completo
- [ ] Verificare che tutti gli utenti ricevano notifiche
- [ ] Monitoraggio produzione 1 settimana

---

## 🎯 **CONCLUSIONE**

**Le correzioni proposte per banner/appuntamenti NON risolvono direttamente le notifiche lead**, ma:

1. ✅ **Migliorano il sistema generale** di notifiche push
2. ✅ **Forniscono il framework** (NotificationManager) per correggere anche i lead
3. ✅ **Richiedono correzione aggiuntiva** specifica per lead

**Raccomandazione:**
- ✅ Implementare **ENTRAMBE** le correzioni:
  1. Correzioni banner/appuntamenti (FASE 1)
  2. Migrazione lead notifications (questa correzione)
- ✅ Testare insieme per validazione completa

