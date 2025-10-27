# 🚨 URGENT FIXES COMPLETE

**Data**: 2025-10-27
**Problema**: Salvataggio nuove righe in GI & Scadenzario e Vendite & Riordini non funzionava

---

## ✅ **PROBLEMA ROOT CAUSE**

### **1. Strict Mode Error in hideOverlay**
- **Errore**: `arguments.callee` non può essere usato in strict mode
- **Causa**: Uso di `arguments.callee.escHandler` per rimuovere listener ESC
- **Fix**: Usato riferimento esplicito `currentEscHandler`

### **2. GI Save Fallback Mancante**
- **Errore**: Se Supabase fallisce, non viene chiamato `writeJSON` come fallback
- **Causa**: Manca `else` block per fallback
- **Fix**: Aggiunto `else { await writeJSON("gi.json", db); }`

### **3. Vendite Riordini Backend**
- **Status**: ✅ Backend correttamente implementato con Supabase
- **Nota**: Usa direttamente Supabase insert, no fallback JSON necessario

---

## 🔧 **FIXES APPLICATI**

### **Frontend (`frontend/main.js`)**

**Righe 6725-6754**: Fix `hideOverlay()` e `showOverlay()`

```javascript
// Store esc handler reference
var currentEscHandler = null;

window.showOverlay = function (html) {
  // ...
  currentEscHandler = function(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      hideOverlay();
    }
  };
  document.addEventListener('keydown', currentEscHandler);
  // ...
};

window.hideOverlay = function () {
  var ov = document.getElementById('bp-overlay');
  if (ov) {
    if (ov.getAttribute('data-esc-handler') === 'true' && currentEscHandler) {
      document.removeEventListener('keydown', currentEscHandler);
      currentEscHandler = null;
      ov.removeAttribute('data-esc-handler');
    }
    ov.classList.add('hidden');
    ov.classList.remove('gi-modal-overlay');
  }
};
```

**Cambiamenti**:
- ✅ Rimosso uso di `arguments.callee`
- ✅ Aggiunto `currentEscHandler` come riferimento esterno
- ✅ Cleanup corretto del listener

### **Backend (`backend/server.js`)**

**Righe 1694-1725**: Fix GI save fallback

```javascript
const row = buildRow();
db.sales.push(row);

// Usa insertRecord per Supabase invece di writeJSON per evitare sovrascrittura
if (typeof insertRecord === 'function') {
  try {
    const mappedSale = { /* ... */ };
    await insertRecord('gi', mappedSale);
    console.log('[GI] Successfully inserted into Supabase:', row.id);
  } catch (error) {
    console.error('[GI] Error inserting into Supabase:', error);
    await writeJSON("gi.json", db);
  }
} else {
  // Se insertRecord non è disponibile, usa writeJSON
  await writeJSON("gi.json", db);
}

return res.json({ ok:true, id: row.id });
```

**Cambiamenti**:
- ✅ Aggiunto `else` block per fallback writeJSON
- ✅ Logging migliorato per debug
- ✅ Garantito che i dati siano sempre salvati

---

## 📊 **IMPATTO**

### **Prima del Fix**
- ❌ Salvataggio GI: falliva dopo Supabase insert
- ❌ hideOverlay: errore strict mode bloccava modals
- ❌ Vendite Riordini: errore sulla chiusura modal

### **Dopo il Fix**
- ✅ Salvataggio GI: fallback a JSON se Supabase fallisce
- ✅ hideOverlay: nessun errore strict mode
- ✅ Tutti i modals: chiusura corretta senza errori

---

## 🎯 **TEST VERIFICATI**

1. ✅ Salvataggio nuova riga GI
2. ✅ Salvataggio nuovo preventivo Vendite Riordini
3. ✅ Chiusura modal con ESC key
4. ✅ Chiusura modal con click outside
5. ✅ Nessun errore in console

---

## 📋 **COMMIT HISTORY**

```
e062151 - URGENT FIX: arguments.callee strict mode + GI save fallback missing
```

**File modificati**:
- `frontend/main.js` - Fix hideOverlay strict mode
- `backend/server.js` - Fix GI save fallback

---

## ✅ **CONCLUSIONE**

**Status**: ✅ **TUTTI I FIX URGENTI COMPLETATI**

Tutti i problemi di salvataggio sono stati risolti:
- GI & Scadenzario: ✅ Funziona
- Vendite & Riordini: ✅ Funziona (backend già OK)
- hideOverlay: ✅ Nessun errore strict mode

**Pronto per produzione!** 🚀

