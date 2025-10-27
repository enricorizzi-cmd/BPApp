# Report Allineamento Modal Appuntamenti vs Form Principale

## Data: 2025-10-27

## 🟢 Funzionalità Allineate

### 1. Struttura e Campi
- ✅ Stesso HTML template (`getAppointmentFormHTML()`)
- ✅ Stessi ID campi con prefisso `modal_` vs `a_`
- ✅ Dropdown clienti identico
- ✅ Bottone NNCF con stessa logica
- ✅ Type buttons con stessa struttura
- ✅ Indicatori (VSS, VSD, Tel, App) identici

### 2. Validazione
- ✅ Cliente obbligatorio (tranne Formazione/MBS/Sottoprodotti)
- ✅ Data/ora obbligatorie
- ✅ Durata minima 1 minuto

### 3. Logica Dati
- ✅ Conversione date con `localInputToISO()`
- ✅ Calcolo `endISO` da durata o ora fine
- ✅ Indicatori convertiti con `Number()`
- ✅ NNCF letto da `getAttribute('data-active')`

### 4. API Calls
- ✅ POST per creazione
- ✅ PUT per modifica (route `/api/appointments/:id` aggiunta)
- ✅ DELETE per eliminazione (route `/api/appointments/:id` aggiunta)

### 5. CSS e Stili
- ✅ Tutti gli stili `.appt-*` duplicati in `.cal-modal-content`
- ✅ Type buttons attivi mostrano gradient
- ✅ NNCF attivo mostra gradient
- ✅ Z-index corretto per overlay

## 🟡 Differenze Funzionali (Non Critical)

### 1. Feedback Utente
**Form Principale:**
```javascript
if (typeof haptic==='function') haptic('success');
if (window.BP.Coach) BP.Coach.say('appointment_created');
```

**Modal:**
- Non implementato
- **Impatto**: Meno feedback tattile/visivo
- **Raccomandazione**: Considerare aggiunta se ritenuto importante

### 2. Eventi Custom
**Form Principale:**
```javascript
document.dispatchEvent(new Event('appt:saved'));
document.dispatchEvent(new Event('appt:created'));
document.dispatchEvent(new Event('ics:exported'));
```

**Modal:**
- Non implementato
- **Impatto**: Altri moduli potrebbero non ricevere notifiche
- **Raccomandazione**: Aggiungere se ci sono listener attivi

### 3. Export ICS
**Form Principale:**
```javascript
BP.ICS.downloadIcsForAppointment(payload)
```

**Modal:**
- Passa solo flag `exportAfter: true` al backend
- Backend non sembra gestire questo flag per export ICS
- **Impatto**: "Salva ed esporta" potrebbe non esportare .ics
- **Raccomandazione**: **ALTA PRIORITÀ** - Verificare/implementare

### 4. Undo Feature
**Form Principale:**
```javascript
showUndo('Appuntamento eliminato', function(){ 
  return POST('/api/appointments', backup); 
}, 5000);
```

**Modal:**
- Non implementato
- **Impatto**: Nessun modo di recuperare appuntamento eliminato per errore
- **Raccomandazione**: Considerare aggiunta per UX migliore

### 5. Refresh UI
**Form Principale:**
```javascript
resetForm(); 
listA(); // Ricarica lista appuntamenti
```

**Modal:**
```javascript
if(typeof renderMonth === 'function'){
  renderMonth(...parseMonth(monthInput.value), {}, consultantSelect.value);
}
```

**Differenze:**
- Modal refresh solo calendario se esiste
- Form refresh sempre lista appuntamenti
- **Impatto**: Minimo, context-aware
- **Status**: OK ✅

## 🔴 Bug Critici Risolti

1. ✅ `currentOverlay is not defined` in saveExportBtn
2. ✅ Route `PUT /appointments/:id` mancante
3. ✅ Route `DELETE /appointments/:id` mancante  
4. ✅ Type button sempre su "vendita" in modifica
5. ✅ NNCF listener duplicati prevenuti con `data-listener`

## 📋 Raccomandazioni Prioritarie

### Alta Priorità
1. **Export ICS in Modal**: Implementare `BP.ICS.downloadIcsForAppointment()` nel bottone "Salva ed esporta"
2. **Backend exportAfter**: Verificare se il backend gestisce il flag `exportAfter: true`

### Media Priorità
3. **Eventi Custom**: Aggiungere dispatch di `appt:saved`, `appt:created`
4. **Undo Delete**: Implementare `showUndo()` per eliminazione da modal

### Bassa Priorità
5. **Haptic/Coach**: Aggiungere feedback tattile e vocale se disponibile
6. **Consistency**: Unificare gestione refresh tra modal e form

## 🧪 Test Raccomandati

- [ ] Creare appuntamento da modal
- [ ] Modificare appuntamento da modal
- [ ] Eliminare appuntamento da modal
- [ ] Verificare indicatori numerici salvati correttamente
- [ ] Testare NNCF attivo/disattivo
- [ ] Testare tutti i type buttons
- [ ] Verificare export .ics da "Salva ed esporta"
- [ ] Testare con cliente esistente e NNCF
- [ ] Verificare calendario refreshato dopo operazioni

## 📝 Note Implementazione

- Modal usa `data-edit-id` su overlay per gestire ID in edit mode
- Modal usa `this.closest('.cal-modal-overlay')` per recuperare overlay nei listener
- Type buttons setup chiamato PRIMA di impostare selezione per evitare reset
- NNCF listener usa `data-listener` attribute per prevenire duplicati

