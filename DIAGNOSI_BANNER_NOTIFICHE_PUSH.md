# 🔍 DIAGNOSI COMPLETA - BANNER E NOTIFICHE PUSH
**Data**: 2025-11-10  
**Status**: ⚠️ PROBLEMI IDENTIFICATI - RICHIEDE CORREZIONI

---

## 📊 **RIEPILOGO PROBLEMI**

### 🔴 **CRITICO - Banner e Notifiche Non Funzionano**

**Sintomi osservati:**
- ❌ Nessun banner post-vendita viene mostrato
- ❌ Nessun banner post-NNCF viene mostrato  
- ❌ Nessun banner vendite riordini viene mostrato
- ❌ Notifiche push non vengono inviate
- ✅ Job backend eseguiti correttamente (ogni 7 minuti)
- ✅ Nessun errore nei log

**Log Backend (ultime 24h):**
```
[NotificationManager] Processed 0 post-appointment notifications
[VenditeRiordini] Not 19:00 yet (current: 8:32), skipping
[DEBUG_SCANSIONE] No appointments found in time range
[QueryOptimization] Query executed in 316ms, found 0 appointments
```

---

## 🔎 **ANALISI DETTAGLIATA**

### **1. PROBLEMA QUERY BACKEND** 🔴 CRITICO

**File**: `backend/lib/notification-manager.js` (righe 180-191)

**Problema Identificato:**
```javascript
// QUERY ATTUALE (ERRATA):
const { data: appointments, error } = await supabase
  .from('appointments')
  .select('id,userid,client,type,end_time,salepromptanswered,nncfpromptanswered,nncf')
  .eq('type', 'vendita')
  .gte('end_time', twoHoursAgo)  // ❌ Solo 2 ore invece di 7 giorni
  .lte('end_time', new Date().toISOString())
  .or('salepromptanswered.is.null,salepromptanswered.eq.false')  // ❌ PROBLEMA
  .or('nncfpromptanswered.is.null,nncfpromptanswered.eq.false') // ❌ PROBLEMA
```

**Causa Root:**
- Due `.or()` separati in Supabase vengono combinati con **AND logico**
- Risultato: richiede che ENTRAMBE le condizioni siano false/null
- Un appuntamento NNCF ha `salepromptanswered=null` ma `nncfpromptanswered=false` → viene escluso
- Un appuntamento vendita ha `nncfpromptanswered=null` ma `salepromptanswered=false` → viene escluso

**Impatto:**
- ❌ Query non trova mai appuntamenti validi
- ❌ Backend processa sempre 0 notifiche
- ❌ Frontend non riceve trigger per mostrare banner

**Correzione Necessaria:**
1. Rimuovere i filtri `.or()` dalla query Supabase
2. Filtrare nel codice JavaScript dopo la query
3. Estendere finestra temporale da 2 ore a 7 giorni (allineamento con frontend)

---

### **2. PROBLEMA FINESTRA TEMPORALE** 🟡 MEDIO

**Backend**: Cerca appuntamenti finiti nelle **ultime 2 ore**  
**Frontend**: Cerca appuntamenti finiti negli **ultimi 7 giorni**

**Impatto:**
- Appuntamenti finiti tra 2 ore e 7 giorni fa non vengono processati dal backend
- Frontend potrebbe mostrare banner ma backend non invia push

**Correzione Necessaria:**
- Allineare backend a 7 giorni (LOOKBACK_DAYS)

---

### **3. PROBLEMA SCAN FRONTEND** 🟡 MEDIO

**File**: `frontend/src/postSaleBanners.js` (righe 732-744)

**Problema Identificato:**
```javascript
// SCAN AUTOMATICO DISABILITATO:
// try{ document.addEventListener('appt:saved', function(){ setTimeout(scan, 50); }); }catch(_){ }
// try{ document.addEventListener('visibilitychange', function(){ if(!document.hidden) setTimeout(scan, 50); }); }catch(_){ }
// try{ setInterval(function(){ scan(); }, 60*1000); }catch(_){ }
```

**Causa:**
- Scan viene eseguito **solo al DOMContentLoaded**
- Se l'utente ha la pagina aperta e un appuntamento finisce, il banner non appare
- Dipendenza totale dal backend per trigger push

**Impatto:**
- Banner non appaiono se utente ha pagina aperta durante fine appuntamento
- Solo push notification (se backend funziona) può triggerare

**Correzione Necessaria:**
- Riabilitare scan periodico (ogni 5-10 minuti) come fallback
- Mantenere scan su `visibilitychange` per quando utente torna alla tab

---

### **4. PROBLEMA DEBUG DISABILITATO** 🟢 BASSO

**File**: `frontend/src/postSaleBanners.js` (riga 59)

**Problema:**
```javascript
function dbg(){
  try{ if (!window || window.DEBUG_BANNERS !== true) return; }catch(_){ return; }
  // ... logging
}
```

**Impatto:**
- Nessun log di debug visibile in console
- Difficile diagnosticare problemi frontend
- `window.DEBUG_BANNERS` non è mai settato a `true`

**Correzione Consigliata:**
- Aggiungere log anche senza DEBUG_BANNERS per errori critici
- Documentare come abilitare debug mode

---

### **5. PROBLEMA MAPPING TIPI NOTIFICHE** 🟡 MEDIO

**File**: `backend/lib/notification-manager.js` vs `frontend/src/postSaleBanners.js`

**Problema Identificato:**
- **Backend** usa: `'post_sale'`, `'post_nncf'`
- **Frontend** usa: `'sale'`, `'nncf'`
- **Push Tracking** mappa entrambi ma potrebbe creare confusione

**Impatto:**
- Potenziale duplicazione o mancata dedupe
- Logica di mapping complessa e fragile

**Correzione Consigliata:**
- Standardizzare su un unico formato
- Documentare mapping chiaramente

---

### **6. PROBLEMA VENDITE RIORDINI** 🟡 MEDIO

**File**: `backend/lib/notification-manager.js` (righe 403-509)

**Problema Identificato:**
```javascript
// Solo se siamo alle 19:00 (con tolleranza di 1 minuto)
if (currentHour !== 19) {
  console.log(`[VenditeRiordini] Not 19:00 yet (current: ${currentHour}:${now.getMinutes()}), skipping`);
  return 0;
}
```

**Impatto:**
- Job eseguito ogni 7 minuti ma funziona solo alle 19:00
- Se job non viene eseguito esattamente alle 19:00, notifiche saltano
- Nessun banner vendite riordini se job non triggera

**Correzione Consigliata:**
- Aumentare tolleranza a 5-10 minuti
- Oppure usare cron job più preciso

---

## 📋 **PIANO DI ATTIVITÀ - CORREZIONI**

### **FASE 1: CORREZIONI CRITICHE** 🔴 (Priorità Alta)

#### **1.1 Fix Query Backend Post-Appointment**
**File**: `backend/lib/notification-manager.js`

**Azioni:**
1. ✅ Rimuovere filtri `.or()` dalla query Supabase
2. ✅ Spostare filtro `answered` nel codice JavaScript dopo query
3. ✅ Estendere finestra temporale da 2 ore a 7 giorni
4. ✅ Aggiungere logging dettagliato per debug

**Codice Target:**
```javascript
// PRIMA (ERRATO):
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const { data: appointments, error } = await supabase
  .from('appointments')
  .select('...')
  .eq('type', 'vendita')
  .gte('end_time', twoHoursAgo)
  .lte('end_time', new Date().toISOString())
  .or('salepromptanswered.is.null,salepromptanswered.eq.false')
  .or('nncfpromptanswered.is.null,nncfpromptanswered.eq.false')

// DOPO (CORRETTO):
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const now = new Date().toISOString();
const { data: appointments, error } = await supabase
  .from('appointments')
  .select('id,userid,client,type,end_time,salepromptanswered,nncfpromptanswered,nncf')
  .eq('type', 'vendita')
  .gte('end_time', sevenDaysAgo)
  .lte('end_time', now)
  // Filtro answered fatto dopo in JavaScript
```

**Test:**
- Verificare che query trovi appuntamenti validi
- Verificare che filtri corretti per NNCF vs vendita normale
- Verificare logging in produzione

---

#### **1.2 Fix Scan Frontend**
**File**: `frontend/src/postSaleBanners.js`

**Azioni:**
1. Riabilitare scan periodico (ogni 5 minuti)
2. Riabilitare scan su `visibilitychange`
3. Mantenere scan su `appt:saved` (opzionale)

**Codice Target:**
```javascript
// Riabilitare dopo riga 737:
// Periodic scan (ogni 5 minuti come fallback)
try{ 
  setInterval(function(){ 
    if (!document.hidden) scan(); 
  }, 5*60*1000); 
}catch(_){ }

// Scan quando tab diventa visibile
try{ 
  document.addEventListener('visibilitychange', function(){ 
    if(!document.hidden) setTimeout(scan, 50); 
  }); 
}catch(_){ }
```

**Test:**
- Verificare che banner appaiano anche con pagina aperta
- Verificare che scan non causi performance issues

---

### **FASE 2: MIGLIORAMENTI** 🟡 (Priorità Media)

#### **2.1 Migliorare Logging Debug**
**File**: `frontend/src/postSaleBanners.js`

**Azioni:**
1. Aggiungere log anche senza DEBUG_BANNERS per errori critici
2. Log quando scan trova appuntamenti
3. Log quando banner viene enqueued

**Codice Target:**
```javascript
function dbg(){
  try{ 
    if (!window || window.DEBUG_BANNERS !== true) {
      // Log solo errori critici anche senza debug
      if (arguments[0] && String(arguments[0]).includes('ERROR')) {
        console.error('[banners]', ...arguments);
      }
      return;
    }
  }catch(_){ return; }
  // ... resto logging
}
```

---

#### **2.2 Fix Vendite Riordini Timing**
**File**: `backend/lib/notification-manager.js`

**Azioni:**
1. Aumentare tolleranza a 10 minuti (19:00-19:10)
2. Oppure usare cron job più preciso

**Codice Target:**
```javascript
// PRIMA:
if (currentHour !== 19) {
  return 0;
}

// DOPO:
if (currentHour !== 19 || (currentHour === 19 && now.getMinutes() > 10)) {
  return 0;
}
```

---

#### **2.3 Standardizzare Tipi Notifiche**
**File**: Vari

**Azioni:**
1. Documentare mapping tipi
2. Considerare unificare formato
3. Aggiungere costanti condivise

---

### **FASE 3: TEST E VALIDAZIONE** 🟢 (Priorità Bassa)

#### **3.1 Test End-to-End**
**Azioni:**
1. Creare appuntamento test tipo "vendita"
2. Impostare `end_time` a 5 minuti fa
3. Verificare che:
   - Backend trova appuntamento
   - Backend invia push notification
   - Frontend mostra banner
   - Banner funziona correttamente

#### **3.2 Test Vendite Riordini**
**Azioni:**
1. Creare vendita con `data_feedback` = oggi
2. Attendere 19:00
3. Verificare che notifica venga inviata

#### **3.3 Monitoraggio Produzione**
**Azioni:**
1. Aggiungere metriche per:
   - Appuntamenti trovati per scan
   - Notifiche inviate
   - Banner mostrati
   - Errori

---

## 🎯 **CHECKLIST CORREZIONI**

### **Correzioni Critiche** (Fare PRIMA)
- [ ] **1.1** Fix query backend post-appointment
- [ ] **1.2** Fix scan frontend periodico
- [ ] Test end-to-end dopo correzioni

### **Miglioramenti** (Fare DOPO)
- [ ] **2.1** Migliorare logging debug
- [ ] **2.2** Fix vendite riordini timing
- [ ] **2.3** Standardizzare tipi notifiche

### **Validazione** (Fare ULTIMO)
- [ ] **3.1** Test end-to-end completo
- [ ] **3.2** Test vendite riordini
- [ ] **3.3** Monitoraggio produzione

---

## 📊 **METRICHE DI SUCCESSO**

Dopo le correzioni, verificare:

1. ✅ Backend trova appuntamenti validi (log: `Found X appointments`)
2. ✅ Backend invia notifiche push (log: `sent=X, failed=0`)
3. ✅ Frontend mostra banner (visibile in UI)
4. ✅ Banner funzionano correttamente (click bottoni)
5. ✅ Nessun duplicato (banner/push non ripetuti)

---

## 🔍 **DEBUGGING TIPS**

### **Abilitare Debug Frontend:**
```javascript
// In console browser:
window.DEBUG_BANNERS = true;
// Poi ricaricare pagina
```

### **Verificare Query Backend:**
```sql
-- Query manuale per test:
SELECT id, userid, client, type, end_time, 
       salepromptanswered, nncfpromptanswered, nncf
FROM appointments
WHERE type = 'vendita'
  AND end_time >= NOW() - INTERVAL '7 days'
  AND end_time <= NOW()
ORDER BY end_time DESC
LIMIT 10;
```

### **Verificare Push Tracking:**
```sql
-- Verificare notifiche inviate:
SELECT * FROM push_notifications_sent
ORDER BY sent_at DESC
LIMIT 20;
```

---

## ⚠️ **NOTE IMPORTANTI**

1. **Non modificare** la logica di dedupe esistente (è corretta)
2. **Mantenere** compatibilità con sistema attuale
3. **Testare** in ambiente di sviluppo prima di produzione
4. **Monitorare** log dopo deploy per verificare correzioni

---

**Prossimi Passi:**
1. ✅ Approvare piano attività
2. ⏳ Implementare FASE 1 (Correzioni Critiche)
3. ⏳ Test end-to-end
4. ⏳ Deploy in produzione
5. ⏳ Monitoraggio risultati

