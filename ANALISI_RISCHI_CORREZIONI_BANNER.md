# ⚠️ ANALISI RISCHI E CONTROINDICAZIONI - CORREZIONI BANNER E NOTIFICHE

**Data**: 2025-11-10  
**Scope**: Analisi completa rischi e controindicazioni delle correzioni proposte

---

## 📊 **RIEPILOGO ESECUTIVO**

**Livello Rischio Complessivo**: 🟡 **MEDIO-ALTO**

**Raccomandazione**: 
- ✅ **FASE 1 (Correzioni Critiche)**: Procedere con cautela, test approfonditi
- ⚠️ **FASE 2 (Miglioramenti)**: Valutare impatto prima di implementare
- 🔴 **FASE 3 (Validazione)**: Obbligatoria prima di produzione

---

## 🔴 **RISCHI CRITICI**

### **1. RISCHIO: DUPLICATI NOTIFICHE E BANNER** 🔴 ALTO

**Causa Root:**
- Backend e frontend possono processare lo stesso appuntamento
- Race condition tra job backend (7 min) e scan frontend (5 min)
- Doppio trigger: push notification + banner frontend

**Scenario Critico:**
```
T0: Appuntamento finisce
T1: Backend job trova appuntamento → invia push → marca come sent
T2: Frontend scan trova stesso appuntamento → mostra banner → invia push (duplicato!)
```

**Impatto:**
- ❌ Utente riceve 2 push notification per stesso appuntamento
- ❌ Banner appare anche se push già inviata
- ❌ Confusione utente
- ❌ Spam notifiche

**Probabilità**: 🟡 **MEDIA** (50-70%)
**Severità**: 🔴 **ALTA** (UX degradata, spam)

**Mitigazione:**
1. ✅ Frontend controlla `pushSent()` PRIMA di `triggerPush()`
2. ✅ Backend marca come sent PRIMA di inviare
3. ⚠️ **PROBLEMA**: Race condition se entrambi eseguono simultaneamente
4. 🔧 **SOLUZIONE**: Frontend deve controllare push tracking PRIMA di mostrare banner

**Raccomandazione**: 
- ⚠️ **CRITICO**: Aggiungere check `pushSent()` nel frontend PRIMA di `enqueueBanner()`
- ⚠️ **CRITICO**: Aggiungere lock/distributed lock per evitare race condition

---

### **2. RISCHIO: PERFORMANCE DATABASE** 🔴 ALTO

**Causa Root:**
- Query estesa da 2 ore a 7 giorni = **84x più dati potenziali**
- Scan frontend ogni 5 minuti = **288 query/giorno per utente**
- Nessun caching o dedupe

**Calcolo Impatto:**
```
Scenario Attuale:
- Query backend: 7 giorni × ~10-20 appuntamenti/giorno = 70-140 appuntamenti
- Query frontend: FULL scan tutti appuntamenti utente (potenzialmente 100+)

Scenario Con Correzione:
- Query backend: 7 giorni × ~10-20 appuntamenti/giorno = 70-140 appuntamenti ✅ (stesso)
- Query frontend: FULL scan ogni 5 minuti = 288 query/giorno × N utenti
```

**Impatto:**
- ❌ Carico database Supabase aumentato del 200-500%
- ❌ Possibile throttling Supabase (rate limits)
- ❌ Latenza query aumentata
- ❌ Costi Supabase potenzialmente aumentati

**Probabilità**: 🟡 **MEDIA** (40-60%)
**Severità**: 🔴 **ALTA** (degradazione performance, costi)

**Mitigazione:**
1. ✅ Backend già ha limite 100 appuntamenti
2. ✅ Batch processing già implementato
3. ⚠️ **PROBLEMA**: Frontend non ha caching
4. 🔧 **SOLUZIONE**: 
   - Aggiungere cache frontend (5 minuti)
   - Incremental refresh invece di full scan
   - Debounce scan se utente non attivo

**Raccomandazione**:
- ⚠️ **CRITICO**: Implementare caching frontend PRIMA di riabilitare scan periodico
- ⚠️ **IMPORTANTE**: Monitorare metriche Supabase dopo deploy

---

### **3. RISCHIO: MEMORY LEAK FRONTEND** 🟡 MEDIO-ALTO

**Causa Root:**
- Scan periodico ogni 5 minuti
- `_pending` Set non viene mai pulito completamente
- Event listeners multipli se pagina ricaricata

**Scenario Critico:**
```
T0: Utente apre pagina → scan() → setInterval registrato
T1: Utente naviga (SPA) → pagina non ricaricata → nuovo setInterval
T2: Dopo 1 ora = 12 setInterval attivi → 12 scan simultanei ogni 5 min
```

**Impatto:**
- ❌ Memory leak progressivo
- ❌ CPU spike ogni 5 minuti
- ❌ Browser crash su dispositivi low-end
- ❌ Battery drain mobile

**Probabilità**: 🟡 **MEDIA** (30-50%)
**Severità**: 🟡 **MEDIA** (degradazione performance client)

**Mitigazione:**
1. ✅ `_pending` Set ha auto-clear (5 minuti)
2. ⚠️ **PROBLEMA**: setInterval non viene cleanup su navigazione SPA
3. 🔧 **SOLUZIONE**: 
   - Cleanup setInterval su `beforeunload` / `visibilitychange`
   - Singleton pattern per scan
   - Debounce scan se già in esecuzione

**Raccomandazione**:
- ⚠️ **IMPORTANTE**: Implementare cleanup listeners PRIMA di riabilitare scan
- ⚠️ **IMPORTANTE**: Test su mobile devices

---

### **4. RISCHIO: NOTIFICHE SPAM UTENTE** 🟡 MEDIO

**Causa Root:**
- Backend processa appuntamenti vecchi (fino a 7 giorni)
- Se utente non ha risposto banner, riceve notifica ogni 7 minuti
- Nessun rate limiting per utente

**Scenario Critico:**
```
T0: Appuntamento finisce 6 giorni fa
T1: Backend trova appuntamento → invia push
T2: Utente non risponde (banner chiuso, push ignorata)
T3: 7 minuti dopo → backend trova stesso appuntamento → invia push (duplicato!)
```

**Impatto:**
- ❌ Utente riceve notifiche ripetute per stesso appuntamento
- ❌ Spam notifiche
- ❌ Utente disabilita notifiche
- ❌ Perdita fiducia nel sistema

**Probabilità**: 🟡 **MEDIA** (40-60%)
**Severità**: 🟡 **MEDIA** (UX degradata)

**Mitigazione:**
1. ✅ Backend controlla `isNotificationSent()` prima di inviare
2. ✅ Backend marca come sent dopo invio
3. ⚠️ **PROBLEMA**: Se push fallisce, non viene marcata → retry infinito
4. 🔧 **SOLUZIONE**: 
   - Rate limiting: max 1 notifica per appuntamento ogni 24h
   - Exponential backoff su errori
   - Dead letter queue per notifiche fallite

**Raccomandazione**:
- ⚠️ **IMPORTANTE**: Aggiungere rate limiting PRIMA di deploy
- ⚠️ **IMPORTANTE**: Monitorare tasso di delivery push

---

## 🟡 **RISCHI MEDI**

### **5. RISCHIO: REGRESSIONE LOGICA FILTRI** 🟡 MEDIO

**Causa Root:**
- Filtro `answered` spostato da SQL a JavaScript
- Logica complessa: NNCF vs vendita normale
- Potenziale bug nella logica di filtro

**Scenario Critico:**
```javascript
// Logica attuale (dopo correzione):
if (appointment.nncf) {
  shouldNotify = appointment.nncfpromptanswered === null || false;
} else {
  shouldNotify = appointment.salepromptanswered === null || false;
}

// BUG POTENZIALE:
// Se appointment.nncf = null (non settato) → tratta come vendita normale
// Ma potrebbe essere NNCF non marcato correttamente
```

**Impatto:**
- ❌ Banner mostrati quando non dovrebbero
- ❌ Banner non mostrati quando dovrebbero
- ❌ Inconsistenza dati

**Probabilità**: 🟢 **BASSA** (10-20%)
**Severità**: 🟡 **MEDIA** (logica errata)

**Mitigazione:**
1. ✅ Test unitari per logica filtro
2. ✅ Test end-to-end con dati reali
3. ⚠️ **PROBLEMA**: Edge cases non testati
4. 🔧 **SOLUZIONE**: 
   - Validazione strict: `nncf === true` (non truthy)
   - Logging dettagliato per debug
   - Test con tutti i casi edge

**Raccomandazione**:
- ⚠️ **IMPORTANTE**: Test approfonditi PRIMA di deploy
- ⚠️ **IMPORTANTE**: Logging dettagliato per monitoraggio

---

### **6. RISCHIO: COSTI SUPABASE AUMENTATI** 🟡 MEDIO

**Causa Root:**
- Query più frequenti (scan frontend ogni 5 min)
- Query più ampie (7 giorni invece di 2 ore)
- Nessun ottimizzazione query

**Calcolo Costi:**
```
Scenario Attuale:
- Query backend: ~20 query/ora × 24h = 480 query/giorno
- Query frontend: ~1 query/utente/giorno × 10 utenti = 10 query/giorno
- Totale: ~490 query/giorno

Scenario Con Correzione:
- Query backend: ~20 query/ora × 24h = 480 query/giorno (stesso)
- Query frontend: ~288 query/utente/giorno × 10 utenti = 2,880 query/giorno
- Totale: ~3,360 query/giorno (6.8x aumento)
```

**Impatto:**
- ❌ Costi Supabase aumentati del 500-700%
- ❌ Possibile superamento quota gratuita
- ❌ Rate limiting Supabase

**Probabilità**: 🟡 **MEDIA** (30-50%)
**Severità**: 🟡 **MEDIA** (costi, limitazioni)

**Mitigazione:**
1. ✅ Supabase free tier: 500MB database, 2GB bandwidth
2. ⚠️ **PROBLEMA**: Query count non limitato ma bandwidth sì
3. 🔧 **SOLUZIONE**: 
   - Caching frontend riduce query del 80-90%
   - Incremental refresh invece di full scan
   - Monitorare costi Supabase

**Raccomandazione**:
- ⚠️ **IMPORTANTE**: Implementare caching PRIMA di riabilitare scan
- ⚠️ **IMPORTANTE**: Monitorare costi Supabase settimanalmente

---

### **7. RISCHIO: INCONSISTENZA STATO BANNER** 🟡 MEDIO

**Causa Root:**
- Frontend e backend hanno logiche separate
- Frontend usa `isBannerAnswered()` (DB appointments)
- Backend usa `isNotificationSent()` (DB push_notifications_sent)
- Due sistemi di tracking non sincronizzati

**Scenario Critico:**
```
T0: Utente risponde banner → frontend marca `salepromptanswered=true`
T1: Backend job trova appuntamento → controlla `isNotificationSent()` → non trovato
T2: Backend invia push (anche se banner già risposto!)
```

**Impatto:**
- ❌ Notifiche inviate per banner già risposti
- ❌ Inconsistenza stato
- ❌ Confusione utente

**Probabilità**: 🟢 **BASSA** (20-30%)
**Severità**: 🟡 **MEDIA** (inconsistenza dati)

**Mitigazione:**
1. ✅ Backend controlla `salepromptanswered` / `nncfpromptanswered` nella query
2. ⚠️ **PROBLEMA**: Filtro fatto dopo query, non nella query stessa
3. 🔧 **SOLUZIONE**: 
   - Backend deve controllare entrambi i flag
   - Sincronizzare sistemi di tracking
   - Unificare logica in un unico posto

**Raccomandazione**:
- ⚠️ **IMPORTANTE**: Backend deve controllare flag `answered` PRIMA di inviare
- ⚠️ **IMPORTANTE**: Test con banner già risposti

---

## 🟢 **RISCHI BASSI**

### **8. RISCHIO: COMPATIBILITÀ BROWSER** 🟢 BASSO

**Causa Root:**
- `visibilitychange` API supportata da tutti browser moderni
- `setInterval` standard ma comportamento diverso su mobile

**Impatto:**
- ❌ Scan non funziona su browser vecchi
- ❌ Comportamento diverso su mobile (background throttling)

**Probabilità**: 🟢 **BASSA** (5-10%)
**Severità**: 🟢 **BASSA** (limitato a browser vecchi)

**Mitigazione:**
1. ✅ Feature detection
2. ✅ Fallback graceful
3. ✅ Test cross-browser

**Raccomandazione**:
- ✅ **OPZIONALE**: Feature detection e fallback

---

### **9. RISCHIO: SECURITY - RATE LIMITING** 🟢 BASSO

**Causa Root:**
- Scan frontend può essere triggerato manualmente
- Nessun rate limiting su endpoint `/api/appointments`

**Impatto:**
- ❌ Possibile DoS se utente malintenzionato
- ❌ Abuso endpoint

**Probabilità**: 🟢 **BASSA** (1-5%)
**Severità**: 🟢 **BASSA** (autenticazione già presente)

**Mitigazione:**
1. ✅ Autenticazione richiesta
2. ✅ Rate limiting backend già presente
3. ✅ Logging per audit

**Raccomandazione**:
- ✅ **OPZIONALE**: Aggiungere rate limiting più aggressivo

---

## 📋 **CONTROINDICAZIONI SPECIFICHE**

### **1. CONTROINDICAZIONE: UTENTI CON PAGINA SEMPRE APERTA** 🟡

**Scenario:**
- Utente tiene pagina aperta 24/7
- Scan ogni 5 minuti = 288 query/giorno
- Carico inutile se utente non attivo

**Impatto:**
- ❌ Carico database inutile
- ❌ Battery drain (mobile)
- ❌ Costi aumentati

**Soluzione:**
- ✅ Scan solo se `!document.hidden`
- ✅ Debounce se utente inattivo > 30 min
- ✅ Pausa scan se tab in background > 1 ora

---

### **2. CONTROINDICAZIONE: APPUNTAMENTI VECCHI (6-7 GIORNI)** 🟡

**Scenario:**
- Appuntamenti finiti 6-7 giorni fa
- Backend li processa e invia notifiche
- Utente potrebbe aver già gestito manualmente

**Impatto:**
- ❌ Notifiche per eventi vecchi
- ❌ Confusione utente
- ❌ Spam

**Soluzione:**
- ✅ Limite: max 3 giorni per notifiche automatiche
- ✅ Notifiche solo per appuntamenti < 3 giorni
- ✅ Banner frontend può mostrare fino a 7 giorni (OK)

---

### **3. CONTROINDICAZIONE: MULTI-DEVICE UTENTE** 🟡

**Scenario:**
- Utente ha app aperta su 2 dispositivi
- Entrambi fanno scan ogni 5 minuti
- Doppio carico database

**Impatto:**
- ❌ Carico database doppio
- ❌ Possibili duplicati banner

**Soluzione:**
- ✅ Backend già gestisce multi-device (push_subscriptions)
- ✅ Frontend usa `_pending` Set per dedupe
- ⚠️ **PROBLEMA**: `_pending` è per-sessione, non cross-device
- 🔧 **SOLUZIONE**: Usare push tracking anche per banner

---

## 🎯 **MATRICE RISCHI**

| Rischio | Probabilità | Severità | Priorità | Mitigazione |
|---------|-------------|----------|----------|-------------|
| Duplicati Notifiche | 🟡 Media | 🔴 Alta | 🔴 CRITICA | Check push tracking PRIMA di banner |
| Performance DB | 🟡 Media | 🔴 Alta | 🔴 CRITICA | Caching frontend obbligatorio |
| Memory Leak | 🟡 Media | 🟡 Media | 🟡 IMPORTANTE | Cleanup listeners |
| Spam Notifiche | 🟡 Media | 🟡 Media | 🟡 IMPORTANTE | Rate limiting |
| Regressione Logica | 🟢 Bassa | 🟡 Media | 🟡 IMPORTANTE | Test approfonditi |
| Costi Supabase | 🟡 Media | 🟡 Media | 🟡 IMPORTANTE | Monitoraggio costi |
| Inconsistenza Stato | 🟢 Bassa | 🟡 Media | 🟡 IMPORTANTE | Sincronizzazione sistemi |
| Compatibilità Browser | 🟢 Bassa | 🟢 Bassa | 🟢 OPZIONALE | Feature detection |
| Security | 🟢 Bassa | 🟢 Bassa | 🟢 OPZIONALE | Rate limiting |

---

## ✅ **RACCOMANDAZIONI FINALI**

### **PRIMA DI IMPLEMENTARE:**

1. 🔴 **CRITICO**: Implementare caching frontend (5 minuti)
2. 🔴 **CRITICO**: Aggiungere check `pushSent()` PRIMA di `enqueueBanner()`
3. 🔴 **CRITICO**: Cleanup listeners su navigazione SPA
4. 🟡 **IMPORTANTE**: Rate limiting notifiche (max 1/24h per appuntamento)
5. 🟡 **IMPORTANTE**: Limite temporale backend (max 3 giorni per notifiche)

### **DURANTE IMPLEMENTAZIONE:**

1. ✅ Test unitari per logica filtro
2. ✅ Test end-to-end con dati reali
3. ✅ Test performance (query count, latenza)
4. ✅ Test multi-device
5. ✅ Test mobile (battery, background throttling)

### **DOPO IMPLEMENTAZIONE:**

1. ✅ Monitoraggio metriche Supabase (query count, bandwidth)
2. ✅ Monitoraggio errori push notifications
3. ✅ Monitoraggio duplicati (log analysis)
4. ✅ Monitoraggio costi Supabase
5. ✅ Feedback utenti (survey, support tickets)

---

## 🚨 **SCENARI DI ROLLBACK**

### **Scenario 1: Performance Database Degradata**
**Sintomi:**
- Query Supabase > 500ms
- Rate limiting Supabase
- Errori 429 (Too Many Requests)

**Rollback:**
1. Disabilitare scan periodico frontend
2. Ridurre finestra backend a 3 giorni
3. Aumentare intervallo scan a 10 minuti

### **Scenario 2: Duplicati Notifiche**
**Sintomi:**
- Utenti ricevono 2+ notifiche per stesso appuntamento
- Log mostrano duplicati

**Rollback:**
1. Aggiungere distributed lock
2. Disabilitare scan frontend temporaneamente
3. Solo backend gestisce notifiche

### **Scenario 3: Memory Leak**
**Sintomi:**
- Browser crash dopo 1+ ora
- Memory usage crescente
- CPU spike

**Rollback:**
1. Disabilitare scan periodico
2. Solo scan su `visibilitychange`
3. Fix cleanup listeners

---

## 📊 **METRICHE DI MONITORAGGIO**

### **Metriche Critiche (Monitorare Ogni Ora):**
- Query count Supabase (target: < 5,000/giorno)
- Latenza query (target: < 200ms p95)
- Push delivery rate (target: > 90%)
- Duplicati notifiche (target: 0%)

### **Metriche Importanti (Monitorare Giornalmente):**
- Costi Supabase (target: < $10/mese)
- Errori push (target: < 5%)
- Banner mostrati vs risposti (target: > 50%)
- User complaints (target: < 1%)

---

**CONCLUSIONE**: 
Le correzioni sono **NECESSARIE** ma richiedono **ATTENZIONE** e **MITIGAZIONI** prima di deploy. Priorità: implementare mitigazioni critiche PRIMA di correzioni.

