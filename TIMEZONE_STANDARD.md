# BPApp - Standard Timezone Management

## Panoramica

Questo documento descrive il nuovo standard unificato per la gestione dei fusi orari implementato in BPApp. Il sistema risolve i problemi di inconsistenza precedenti garantendo una gestione coerente e affidabile delle date e degli orari.

## Principi Fondamentali

### 1. **Salvataggio Sempre UTC**
- Tutti i dati vengono salvati nel database in formato UTC (ISO string con Z)
- Esempio: `"2025-08-25T20:41:00.000Z"`

### 2. **Conversione per Display**
- Il frontend converte automaticamente UTC in orario locale per la visualizzazione
- Gli utenti vedono sempre gli orari nel loro timezone locale

### 3. **Parsing Robusto**
- Le utility gestiscono diversi formati di input
- Fallback intelligenti per dati legacy o malformati

## Architettura

### Backend (`backend/lib/timezone.js`)

```javascript
// Parsing universale
parseDateTime(input) -> Date (UTC)

// Conversione per salvataggio
toUTCString(date) -> ISO string UTC

// Utility per calcoli
minutesBetween(start, end) -> number
addMinutes(date, minutes) -> Date
timeRangesOverlap(start1, end1, start2, end2) -> boolean
```

### Frontend (`frontend/lib/timezone.js`)

```javascript
// Parsing da backend
parseUTCString(utcString) -> Date (locale)

// Conversione per display
toLocalDisplay(date) -> "DD/MM/YYYY HH:MM"
toLocalInputValue(date) -> "YYYY-MM-DDTHH:MM"

// Utility per UI
formatDuration(minutes) -> "2h 30m"
```

## Migrazione Completata

### Dati Migrati
- ✅ **23 appuntamenti** convertiti al nuovo formato
- ✅ **0 errori** durante la migrazione
- ✅ **Backup completo** disponibile in `appointments.backup.json`

### Esempi di Conversione

**Prima (formato misto):**
```json
{
  "start": "2025-08-25T20:41:00.000Z",
  "end": "2025-08-25T21:41"
}
```

**Dopo (formato standardizzato):**
```json
{
  "start": "2025-08-25T20:41:00.000Z",
  "end": "2025-08-25T19:41:00.000Z"
}
```

## Benefici del Nuovo Standard

### 1. **Consistenza**
- Eliminati i formati misti locale/UTC
- Parsing uniforme in tutto il sistema

### 2. **Affidabilità**
- Slot calendario e appuntamenti ora confrontati correttamente
- Eliminate sovrapposizioni errate

### 3. **Manutenibilità**
- Codice centralizzato per gestione timezone
- Facile debugging e testing

### 4. **Scalabilità**
- Supporto per utenti in diversi fusi orari
- Preparazione per funzionalità internazionali

## Utilizzo

### Creazione Appuntamento
```javascript
// Frontend invia orario locale
const startLocal = "2025-08-25T20:41";
const startUTC = parseDateTime(startLocal); // Converte a UTC
const endUTC = addMinutes(startUTC, 90);

// Backend salva in UTC
const appointment = {
  start: toUTCString(startUTC),
  end: toUTCString(endUTC)
};
```

### Visualizzazione Appuntamento
```javascript
// Backend restituisce UTC
const appointment = { start: "2025-08-25T20:41:00.000Z" };

// Frontend converte per display
const startLocal = parseUTCString(appointment.start);
const display = toLocalDisplay(startLocal); // "25/08/2025 20:41"
```

### Calcolo Slot Disponibili
```javascript
// Confronto corretto tra slot e appuntamenti
const slotStart = "2025-08-25T08:30:00.000Z";
const appointmentStart = "2025-08-25T20:41:00.000Z";

// Entrambi in UTC, confronto accurato
const overlap = timeRangesOverlap(slotStart, slotEnd, appointmentStart, appointmentEnd);
```

## File Coinvolti

### Backend
- `backend/lib/timezone.js` - Utility centralizzate
- `backend/routes/appointments.js` - Gestione appuntamenti
- `backend/server.js` - Slot disponibilità
- `backend/migrate-timezone.js` - Script migrazione

### Frontend
- `frontend/lib/timezone.js` - Utility frontend
- `frontend/main.js` - Display appuntamenti
- `frontend/lib/ics-single.js` - Export ICS

## Testing

Per testare il nuovo sistema:

1. **Verifica Display**: Gli appuntamenti devono apparire negli orari corretti
2. **Verifica Slot**: Gli slot disponibili devono essere calcolati correttamente
3. **Verifica Creazione**: Nuovi appuntamenti devono essere salvati in UTC
4. **Verifica Export**: I file ICS devono contenere orari UTC corretti

## Troubleshooting

### Problemi Comuni

1. **Orari Sbagliati nel Display**
   - Verificare che il browser sia configurato con il timezone corretto
   - Controllare che `parseUTCString()` sia utilizzato correttamente

2. **Slot Non Disponibili**
   - Verificare che gli appuntamenti siano salvati in UTC
   - Controllare la logica di `timeRangesOverlap()`

3. **Errori di Parsing**
   - Utilizzare `parseDateTime()` per input robusti
   - Verificare il formato dei dati legacy

### Debug

```javascript
// Verifica conversione
const utc = "2025-08-25T20:41:00.000Z";
const local = parseUTCString(utc);
console.log("UTC:", utc);
console.log("Local:", toLocalDisplay(local));

// Verifica validità
const isValid = isValidDateTime(utc);
console.log("Valid:", isValid);
```

## Conclusioni

Il nuovo standard timezone risolve completamente i problemi precedenti:

- ✅ **Eliminata inconsistenza** nei formati di data
- ✅ **Risolti conflitti** tra slot e appuntamenti  
- ✅ **Unificata gestione** timezone in tutto il sistema
- ✅ **Migliorata affidabilità** dei calcoli temporali
- ✅ **Preparata base** per funzionalità future

Il sistema è ora robusto, scalabile e pronto per l'uso in produzione.
