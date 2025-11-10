# 🔍 DIAGNOSI ERRORE CREAZIONE RIGA GI DA BANNER

**Data**: 2025-11-10  
**Problema**: Quando si conferma la vendita nel banner post-vendita o post-NNCF, si verifica un errore nella creazione della riga in `gi` e non si apre la modal della nuova vendita gi.

---

## 📊 **ANALISI DEL PROBLEMA**

### **1. Flusso di Esecuzione**

Quando l'utente clicca "Sì" sul banner:
1. ✅ `markBannerAnswered(appt.id, KIND_SALE/NNCF, 'yes')` - Salva risposta banner
2. ✅ `openVSSQuickEditor(appt)` - Apre editor VSS
3. ✅ Utente inserisce VSS e clicca "Salva"
4. ❌ `upsertGIFromAppointment(appt, v)` - **QUI SI VERIFICA L'ERRORE**
5. ❌ `tryOpenGiBuilder(id)` - Non viene eseguito perché `sale.id` è undefined

### **2. Codice Frontend (`frontend/src/postSaleBanners.js`)**

**Riga 377-391**: `upsertGIFromAppointment`
```javascript
async function upsertGIFromAppointment(appt, vss){
  let clientId = appt.clientId || null;
  if (!clientId) clientId = await findClientIdByName(appt.client);
  const payload = {
    apptId: appt.id,  // ⚠️ PROBLEMA: invia "apptId"
    date: new Date(appt.end || appt.start || Date.now()).toISOString(),
    clientId: clientId || undefined,
    clientName: appt.client || 'Cliente',
    vssTotal: Math.round(Number(vss||0)),
    services: appt.services || appt.note || '',
    consultantId: appt.userId || appt.ownerId || null
  };
  const resp = await POST('/api/gi', payload);
  return (resp && (resp.sale || resp.gi || resp.data)) || resp;
}
```

**Problema identificato**: Il frontend invia `apptId` ma il backend si aspetta `appointmentId`.

### **3. Codice Backend (`backend/server.js`)**

**Riga 1626-1728**: Endpoint `/api/gi`

**Riga 1674-1688**: `buildRow()`
```javascript
function buildRow(){
  return {
    id: genId(),
    appointmentId: body.appointmentId || null,  // ⚠️ Cerca "appointmentId" (non "apptId")
    clientId: String(body.clientId||""),
    clientName: String(body.clientName||"Cliente"),
    date: String(body.date || new Date().toISOString()),
    consultantId: String(body.consultantId || req.user.id),
    consultantName: String(body.consultantName || req.user.name || "unknown"),
    services: String(body.services || ""),
    vssTotal: Number(body.vssTotal || 0),
    schedule: _mapSchedule(body.schedule),
    createdAt: todayISO()
  };
}
```

**Riga 1700-1715**: Inserimento in Supabase
```javascript
const mappedSale = {
  id: row.id,
  appointmentid: row.appointmentId,  // ⚠️ Sarà null perché body.appointmentId è undefined
  clientid: row.clientId,
  clientname: row.clientName,
  date: row.date,
  consultantid: row.consultantId,
  consultantname: row.consultantName,
  services: row.services,
  vsstotal: row.vssTotal,
  schedule: row.schedule,
  createdat: row.createdAt
};
await insertRecord('gi', mappedSale);
```

### **4. Possibili Cause dell'Errore**

#### **Causa 1: Mismatch nome campo `apptId` vs `appointmentId`** 🔴 **CRITICO**
- **Frontend invia**: `apptId`
- **Backend si aspetta**: `appointmentId`
- **Risultato**: `row.appointmentId` sarà `null` o `undefined`
- **Impatto**: Se il campo `appointmentid` in Supabase ha constraint NOT NULL, l'inserimento fallirà

#### **Causa 2: Campo `date` vs `data` in Supabase** 🟡 **POSSIBILE**
- **Backend mappa**: `date: row.date`
- **Supabase potrebbe avere**: campo `data` (non `date`)
- **Impatto**: Se il campo si chiama `data` e non `date`, l'inserimento fallirà

#### **Causa 3: Campo `schedule` non serializzato correttamente** 🟡 **POSSIBILE**
- **Backend mappa**: `schedule: row.schedule`
- **Supabase si aspetta**: JSONB
- **Impatto**: Se `schedule` non è un oggetto/array valido, l'inserimento potrebbe fallire

#### **Causa 4: Campo `clientid` nullable ma constraint** 🟡 **POSSIBILE**
- **Backend mappa**: `clientid: row.clientId` (può essere stringa vuota `""`)
- **Supabase potrebbe avere**: constraint NOT NULL o tipo TEXT che non accetta stringa vuota
- **Impatto**: Se `clientId` è `undefined` o stringa vuota e Supabase richiede NOT NULL, l'inserimento fallirà

---

## 🔍 **VERIFICHE NECESSARIE**

### **1. Schema Tabella `gi` in Supabase**
- ✅ Verificare nome esatto dei campi (`date` vs `data`, `appointmentid` vs `appointment_id`)
- ✅ Verificare constraint NOT NULL
- ✅ Verificare tipo dati (TEXT, JSONB, etc.)
- ✅ Verificare valori di default

### **2. Logs Backend**
- ✅ Cercare errori recenti con `[GI] Error inserting into Supabase`
- ✅ Verificare messaggio di errore specifico
- ✅ Verificare payload ricevuto dal frontend

### **3. Mapping Campi**
- ✅ Verificare che tutti i campi mappati esistano nella tabella
- ✅ Verificare che i tipi dati corrispondano
- ✅ Verificare che i valori null/undefined siano gestiti correttamente

---

## 🎯 **PROBLEMA PRINCIPALE IDENTIFICATO**

### **Mismatch Nome Campo: `apptId` vs `appointmentId`**

**Frontend** (`postSaleBanners.js` riga 381):
```javascript
apptId: appt.id,  // ❌ Nome errato
```

**Backend** (`server.js` riga 1677):
```javascript
appointmentId: body.appointmentId || null,  // ✅ Nome corretto
```

**Risultato**: `row.appointmentId` sarà sempre `null` perché `body.appointmentId` è `undefined`.

**Impatto**: 
- Se `appointmentid` in Supabase è NOT NULL → **ERRORE**
- Se `appointmentid` in Supabase è nullable → Funziona ma perde il collegamento con l'appuntamento

---

## 📝 **ALTRI PROBLEMI POTENZIALI**

### **1. Risposta API non standardizzata**
**Frontend** (riga 390):
```javascript
return (resp && (resp.sale || resp.gi || resp.data)) || resp;
```

**Backend** (riga 1727):
```javascript
return res.json({ ok:true, id: row.id });
```

**Problema**: Il backend ritorna `{ ok: true, id: row.id }` ma il frontend cerca `resp.sale`, `resp.gi`, o `resp.data`. Quindi `sale.id` sarà sempre `undefined`.

**Impatto**: Anche se l'inserimento riesce, `tryOpenGiBuilder(id)` non viene chiamato perché `sale.id` è `undefined`.

---

## ✅ **SOLUZIONI PROPOSTE**

### **Soluzione 1: Fix Frontend - Cambiare `apptId` in `appointmentId`** 🔴 **CRITICO**
```javascript
// frontend/src/postSaleBanners.js riga 381
appointmentId: appt.id,  // ✅ Nome corretto
```

### **Soluzione 2: Fix Backend - Supportare entrambi i nomi** 🟡 **ALTERNATIVA**
```javascript
// backend/server.js riga 1677
appointmentId: body.appointmentId || body.apptId || null,  // ✅ Supporta entrambi
```

### **Soluzione 3: Fix Risposta API - Standardizzare formato** 🔴 **CRITICO**
```javascript
// backend/server.js riga 1727
return res.json({ ok: true, id: row.id, sale: { id: row.id } });  // ✅ Formato standardizzato
```

### **Soluzione 4: Fix Frontend - Gestire risposta corretta** 🟡 **ALTERNATIVA**
```javascript
// frontend/src/postSaleBanners.js riga 390
const resp = await POST('/api/gi', payload);
const saleId = resp?.id || resp?.sale?.id || resp?.gi?.id || resp?.data?.id;
if (saleId) {
  tryOpenGiBuilder(saleId);
}
```

---

## 🎯 **PRIORITÀ INTERVENTI**

1. 🔴 **CRITICO**: Fix mismatch `apptId` → `appointmentId` (Soluzione 1)
2. 🔴 **CRITICO**: Fix risposta API per standardizzare formato (Soluzione 3)
3. 🟡 **IMPORTANTE**: Verificare schema Supabase per constraint
4. 🟡 **IMPORTANTE**: Aggiungere logging dettagliato per debug

---

## 📋 **CHECKLIST VERIFICA**

- [ ] Verificare schema tabella `gi` in Supabase
- [ ] Verificare logs backend per errore specifico
- [ ] Testare inserimento manuale con payload corretto
- [ ] Verificare che `insertRecord` gestisca correttamente gli errori
- [ ] Verificare che la risposta API contenga l'ID della vendita creata

---

**STATUS**: ⚠️ **PROBLEMA IDENTIFICATO - ATTESA VERIFICA SCHEMA SUPABASE**

