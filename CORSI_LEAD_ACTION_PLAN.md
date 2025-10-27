# 🎯 Piano di Azione: Corsi Interaziendali & Gestione Lead

## Data: 2025-10-27

---

## 📋 REPORT SINTETICO

### 🎓 CORSI INTERAZIENDALI
**Status**: 🟡 Funzionante con miglioramenti necessari  
**Backend**: ✅ Solido (routes/corsi.js)  
**Frontend**: 🟡 Migliorabile (viewCorsiInteraziendali)  
**Criticità**: 2 medio-alte, 5 medie, 3 basse

### 👥 GESTIONE LEAD  
**Status**: 🟢 Buono  
**Backend**: ✅ Robusto (routes/leads.js con push notifications)  
**Frontend**: 🟢 Completo (viewGestioneLead)  
**Criticità**: 1 medio-alta, 3 medie, 2 basse

---

## 🎓 CORSI INTERAZIENDALI - PUNTI DI FORZA

✅ **Architettura**
- Sistema multi-tab (Catalogo, Calendario, Iscrizioni)
- Separazione logica ben definita
- State management chiaro

✅ **Backend Routes Solide**
- CRUD completo per catalogo, date, iscrizioni
- Validazione campi
- Foreign keys per integrità referenziale
- Auth e permission check

✅ **UI/UX**
- Design coerente con app
- Filtri multipli (granularità, periodo, corso, consulente)
- Navigazione prev/next periodo
- Table responsive

---

## ⚠️ CORSI INTERAZIENDALI - PROBLEMI IDENTIFICATI

### 🔴 CRITICI

Nessuno identificato

### 🟡 IMPORTANTI

1. **Gestione Errori API Incompleta**
   - Molti `.catch()` vuoti o generici
   - Non tutti i fetch hanno fallback
   - Toast generici senza dettagli

2. **Validazione Frontend Debole**
   - Manca validazione durata > 0 prima di submit
   - Campi obbligatori non evidenziati visivamente
   - No feedback real-time su input invalidi

### 🟢 MINORI

3. **Performance**
   - Nessun caching dei dati corsi
   - Reload completo ad ogni cambio filtro
   - Potrebbero beneficiare di debounce

4. **UX**
   - Manca conferma prima eliminazione
   - No loading states durante API calls
   - No messaggi di successo dettagliati

5. **Accessibilità**
   - Mancano aria-labels
   - Focus management non ottimale nei modal
   - Keyboard navigation limitata

---

## 👥 GESTIONE LEAD - PUNTI DI FORZA

✅ **Backend Robusto**
- Push notifications su assegnazione
- Gestione cambio consulente
- Locking mechanism (editing_by/editing_at)
- Filtri multipli (consulente, periodo, stato contatto)

✅ **Funzionalità Avanzate**
- Tab separati (Elenco, Da Contattare)
- Banner automatico per chiamate  
- Sistema di tracking contatto
- Granularità temporale completa

✅ **Sicurezza**
- Auth verificato
- Ownership check
- Admin-only operations

---

## ⚠️ GESTIONE LEAD - PROBLEMI IDENTIFICATI

### 🟡 IMPORTANTI

1. **Gestione Conflitti Edit**
   - Sistema locking presente ma UX migliorabile
   - Nessun auto-refresh se altro utente modifica
   - Timeout editing_at non verificato

### 🟢 MINORI

2. **Validazione**
   - Email non validata con regex
   - Telefono senza formato validation
   - Campi non sanitizzati

3. **Performance**
   - Tabella può diventare pesante con molti lead
   - Manca paginazione
   - No virtual scrolling

4. **UX**
   - Banner "contatta lead" potrebbe essere invasivo
   - No preview prima eliminazione
   - Filtri potrebbero essere più intuitivi

---

## 📊 ANALISI COMPARATIVA

| Aspetto | Corsi | Lead | Gap |
|---------|-------|------|-----|
| **Error Handling** | 🟡 Basico | 🟢 Buono | Corsi -1 |
| **Validazione** | 🟡 Debole | 🟢 Media | Corsi -1 |
| **Performance** | 🟡 OK | 🟡 OK | Pari |
| **Security** | 🟢 Buona | 🟢 Buona | Pari |
| **UX** | 🟢 Buona | 🟢 Buona | Pari |
| **Backend** | 🟢 Solido | 🟢 Robusto | Pari |
| **Accessibilità** | 🟡 Media | 🟡 Media | Pari |

---

## 🎯 PIANO TODO ARTICOLATO

### FASE 1: STABILITÀ E SICUREZZA (Priorità Alta)

#### Corsi Interaziendali

**TODO-C1**: Migliorare Error Handling  
- [ ] Aggiungere try-catch completi a tutte le funzioni async
- [ ] Implementare toast dettagliati con messaggi specifici
- [ ] Aggiungere fallback per fetch failures
- [ ] Log errori con context per debugging
**Stima**: 3-4 ore  
**Impatto**: Alto

**TODO-C2**: Validazione Frontend Robusta  
- [ ] Validare durata_giorni > 0 prima submit
- [ ] Validare costo_corso >= 0
- [ ] Evidenziare visivamente campi obbligatori (*)
- [ ] Real-time validation feedback
- [ ] Sanitizzazione input prima invio
**Stima**: 2-3 ore  
**Impatto**: Medio-Alto

**TODO-C3**: Conferme Eliminazione  
- [ ] Aggiungere confirm() prima delete catalogo
- [ ] Aggiungere confirm() prima delete date
- [ ] Aggiungere confirm() prima delete iscrizioni
- [ ] Implementare Undo per eliminazioni (come appuntamenti)
**Stima**: 1-2 ore  
**Impatto**: Medio

#### Gestione Lead

**TODO-L1**: Migliorare Locking System  
- [ ] Auto-refresh ogni 30s per verificare lock
- [ ] Toast warning se lead bloccato da altro utente
- [ ] Auto-release lock dopo 5 minuti inattività
- [ ] Visual indicator quando lead è in editing
**Stima**: 3-4 ore  
**Impatto**: Medio-Alto

**TODO-L2**: Validazione Email/Telefono  
- [ ] Regex validation per email
- [ ] Format validation per numero telefono
- [ ] Sanitizzazione input
- [ ] Feedback visivo errori validazione
**Stima**: 1-2 ore  
**Impatto**: Medio

---

### FASE 2: PERFORMANCE (Priorità Media)

**TODO-C4**: Ottimizzazione Caricamento Dati  
- [ ] Implementare caching corsi catalogo (5 minuti)
- [ ] Debounce su filtri (300ms)
- [ ] Lazy loading per tabelle lunghe
- [ ] Preload dati tab al passaggio mouse
**Stima**: 4-5 ore  
**Impatto**: Medio

**TODO-L3**: Paginazione/Virtual Scrolling  
- [ ] Implementare paginazione backend (20 items/pagina)
- [ ] Virtual scrolling per table con >100 lead
- [ ] Infinite scroll come alternativa
- [ ] Indicatori "X di Y" totali
**Stima**: 5-6 ore  
**Impatto**: Alto (se >100 lead)

---

### FASE 3: UX ENHANCEMENTS (Priorità Media-Bassa)

**TODO-C5**: Loading States  
- [ ] Skeleton loaders per tabelle
- [ ] Spinner durante API calls
- [ ] Disable buttons durante submit
- [ ] Progress indicators per operazioni lunghe
**Stima**: 2-3 ore  
**Impatto**: Medio

**TODO-L4**: Banner Chiamate Migliorato  
- [ ] Snooze configurabile (15min, 1h, 4h, domani)
- [ ] Non mostrare se già contattato oggi
- [ ] Prioritizzazione per scadenza 24h
- [ ] Statistiche chiamate nel banner
**Stima**: 3-4 ore  
**Impatto**: Medio

**TODO-C6**: Modal Improvements  
- [ ] Escape key per chiudere
- [ ] Click fuori per chiudere (con conferma se modifiche)
- [ ] Focus trap nei modal
- [ ] Tab navigation ottimizzata
**Stima**: 2 ore  
**Impatto**: Basso

**TODO-L5**: Filtri Avanzati  
- [ ] Ricerca full-text su tutti i campi
- [ ] Filtro per sorgente lead
- [ ] Filtro per provincia/comune
- [ ] Export filtered data (CSV/Excel)
**Stima**: 3-4 ore  
**Impatto**: Medio

---

### FASE 4: ACCESSIBILITÀ (Priorità Bassa)

**TODO-C7**: Accessibility  
- [ ] aria-label su tutti i bottoni
- [ ] role="dialog" sui modal
- [ ] aria-live per toast notifications
- [ ] Keyboard shortcuts (? per help)
**Stima**: 2-3 ore  
**Impatto**: Basso

**TODO-L6**: Accessibility  
- [ ] Stesso di TODO-C7 per sezione Lead
- [ ] Screen reader friendly tables
- [ ] High contrast mode support
**Stima**: 2-3 ore  
**Impatto**: Basso

---

## 🚀 ROADMAP CONSIGLIATA

### Sprint 1 (1 settimana)
- TODO-C1: Error Handling Corsi
- TODO-C2: Validazione Corsi
- TODO-C3: Conferme Eliminazione
- TODO-L1: Locking System Lead
- TODO-L2: Validazione Lead

**Obiettivo**: Stabilità e Sicurezza  
**Effort**: 12-16 ore

### Sprint 2 (1 settimana)
- TODO-C4: Performance Corsi
- TODO-L3: Paginazione Lead
- TODO-C5: Loading States

**Obiettivo**: Performance e Scalabilità  
**Effort**: 11-14 ore

### Sprint 3 (1 settimana)  
- TODO-L4: Banner Chiamate
- TODO-C6: Modal Improvements
- TODO-L5: Filtri Avanzati

**Obiettivo**: UX Excellence  
**Effort**: 8-10 ore

### Sprint 4 (Opzionale)
- TODO-C7: Accessibility Corsi
- TODO-L6: Accessibility Lead

**Obiettivo**: Inclusività  
**Effort**: 4-6 ore

---

## 📈 METRICHE DI SUCCESSO

### Corsi Interaziendali
- ✅ Zero errori non gestiti in console
- ✅ 100% validazione campi obbligatori
- ✅ Tempo risposta API < 500ms
- ✅ Conferma prima ogni delete

### Gestione Lead
- ✅ Locking conflicts < 1%
- ✅ Email/Tel validati al 100%
- ✅ Paginazione per >50 lead
- ✅ Banner snooze utilizzato >50%

---

## 🎓 RIEPILOGO PRIORITÀ

### 🔴 URGENTE (Fare subito)
- Nessuno

### 🟡 IMPORTANTE (Prossime 2 settimane)
1. TODO-C1: Error Handling Corsi
2. TODO-C2: Validazione Corsi
3. TODO-L1: Locking System Lead
4. TODO-L2: Validazione Lead

### 🟢 NICE-TO-HAVE (Quando possibile)
- Tutti gli altri TODO

---

## 💡 NOTE IMPLEMENTATIVE

### Corsi
- Usare stessa logica appuntamenti per error handling
- Implementare Undo come in appuntamenti
- Coach feedback per operazioni corsi
- Haptic feedback su save/delete

### Lead
- Polling ogni 30s per verificare locks
- WebSocket future consideration per real-time
- Export data con libreria esistente (se disponibile)
- Integrare con calendario per follow-up

---

## 🔧 TECH DEBT DA RISOLVERE

1. **Corsi**: Unificare gestione modal con pattern usato in appuntamenti
2. **Lead**: Separare logica business da rendering UI
3. **Entrambe**: Estrarre costanti magiche in config
4. **Entrambe**: Aggiungere unit tests per validazioni

---

**Fine Report**

