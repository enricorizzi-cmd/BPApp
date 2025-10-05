# WORKFLOW RULES - SISTEMATICO E RIGIDO

## 🎯 PRINCIPIO FONDAMENTALE
**Ogni task deve essere gestito con approccio sistematico, metodico e completo. Nessuna attività deve essere lasciata a metà o approssimata.**

---

## 📋 WORKFLOW OBBLIGATORIO PER OGNI TASK

### **FASE 1: ANALISI E PIANIFICAZIONE**
1. **COMPRENSIONE COMPLETA**
   - Leggere attentamente la richiesta dell'utente
   - Identificare tutti gli aspetti coinvolti
   - Chiarire eventuali ambiguità con domande specifiche

2. **CREAZIONE TODO LIST**
   - Usare `todo_write` con `merge=false` per task complessi (3+ step)
   - Creare task specifici, azionabili e misurabili
   - Assegnare stato `in_progress` al primo task
   - Aggiornare TODO dopo ogni completamento

3. **ANALISI SISTEMATICA**
   - Cercare nel codebase tutti i file/pattern coinvolti
   - Usare `grep`, `codebase_search`, `glob_file_search` per mappare completamente
   - Identificare dipendenze e impatti collaterali

### **FASE 2: IMPLEMENTAZIONE METODICA**
1. **APPROCCIO ITERATIVO**
   - Un task alla volta, completarlo al 100% prima di passare al successivo
   - Usare `todo_write` per marcare completamenti
   - Testare ogni modifica prima di procedere

2. **MODIFICHE SICURE**
   - Leggere sempre il file completo prima di modificare
   - Usare `search_replace` con contesto sufficiente per unicità
   - Verificare sintassi con `read_lints` dopo modifiche
   - Committare ogni gruppo logico di modifiche

3. **VERIFICA CONTINUA**
   - Testare funzionalità dopo ogni modifica significativa
   - Verificare che non si siano introdotti regressioni
   - Controllare che tutti i casi edge siano gestiti

### **FASE 3: COMPLETAMENTO E DOCUMENTAZIONE**
1. **TEST FINALE**
   - Verificare che tutti i requisiti siano soddisfatti
   - Testare scenari di utilizzo tipici
   - Controllare che l'interfaccia sia coerente

2. **COMMIT E DEPLOY**
   - Commit con messaggio descrittivo e specifico
   - Push immediato per deploy automatico
   - Verificare che il deploy sia completato

3. **DOCUMENTAZIONE**
   - Fornire riassunto completo delle modifiche
   - Spiegare la logica implementata
   - Evidenziare eventuali limitazioni o considerazioni

---

## 🔧 STRUMENTI E PATTERN OBBLIGATORI

### **RICERCA E ANALISI**
```bash
# Per ogni task, iniziare con:
grep -r "pattern" path/ --include="*.js" --include="*.html"
codebase_search "query semantica" target_directories
glob_file_search "pattern" target_directory
```

### **MODIFICA SICURA**
```bash
# Sequenza obbligatoria:
read_file target_file                    # Leggere sempre prima
search_replace file_path old_string new_string  # Modificare con contesto
read_lints paths                        # Verificare errori
run_terminal_cmd "git add ."           # Staging
run_terminal_cmd "git commit -m 'descrizione specifica'"  # Commit
run_terminal_cmd "git push"            # Deploy
```

### **GESTIONE TODO**
```javascript
// All'inizio di task complessi:
todo_write(merge=false, todos=[
  {id: "task1", content: "Descrizione specifica", status: "in_progress"},
  {id: "task2", content: "Descrizione specifica", status: "pending"}
])

// Dopo ogni completamento:
todo_write(merge=true, todos=[
  {id: "task1", status: "completed"},
  {id: "task2", status: "in_progress"}
])
```

---

## 📝 TEMPLATE DI RISPOSTA OBBLIGATORIO

### **INIZIO TASK**
```
🎯 **TASK IDENTIFICATO**: [Descrizione breve]

📋 **PIANO DI LAVORO**:
1. [Task specifico 1] - IN CORSO
2. [Task specifico 2] - PENDING
3. [Task specifico 3] - PENDING

🔍 **ANALISI INIZIALE**:
- File coinvolti: [lista]
- Pattern da cercare: [lista]
- Dipendenze: [lista]
```

### **DURANTE IMPLEMENTAZIONE**
```
✅ **COMPLETATO**: [Task specifico]
🔄 **IN CORSO**: [Task specifico]
⏳ **PENDING**: [Lista task rimanenti]

📝 **MODIFICHE APPORTATE**:
- File: [nome] - [descrizione modifica]
- File: [nome] - [descrizione modifica]
```

### **FINE TASK**
```
🎉 **TASK COMPLETATO AL 100%**

📊 **RIASSUNTO FINALE**:
- ✅ [Requisito 1] - IMPLEMENTATO
- ✅ [Requisito 2] - IMPLEMENTATO
- ✅ [Requisito 3] - IMPLEMENTATO

🔧 **MODIFICHE TECNICHE**:
- [Dettaglio tecnico 1]
- [Dettaglio tecnico 2]
- [Dettaglio tecnico 3]

🚀 **DEPLOY**: Completato e verificato
```

---

## ⚠️ REGOLE RIGIDE - MAI VIOLARE

### **NON FARE MAI**
- ❌ Modificare file senza leggere prima il contenuto completo
- ❌ Committare modifiche senza testare
- ❌ Lasciare task a metà senza aggiornare TODO
- ❌ Usare `replace_all` senza verificare l'impatto
- ❌ Procedere senza aver compreso completamente la richiesta
- ❌ Saltare la verifica con `read_lints`
- ❌ Dimenticare di fare push dopo commit

### **SEMPRE FARE**
- ✅ Creare TODO per task complessi
- ✅ Leggere file completo prima di modificare
- ✅ Usare contesto sufficiente in `search_replace`
- ✅ Verificare con `read_lints` dopo modifiche
- ✅ Committare con messaggi descrittivi
- ✅ Fare push immediato per deploy
- ✅ Fornire riassunto completo alla fine
- ✅ Aggiornare TODO dopo ogni completamento

---

## 🎯 ESEMPI DI APPLICAZIONE

### **TASK SEMPLICE** (< 3 step)
```
1. Analizzare richiesta
2. Implementare modifica
3. Testare e committare
4. Fornire riassunto
```

### **TASK COMPLESSO** (3+ step)
```
1. Creare TODO list dettagliata
2. Analisi sistematica del codebase
3. Implementazione step-by-step
4. Aggiornamento TODO continuo
5. Test finale completo
6. Deploy e verifica
7. Documentazione completa
```

---

## 🔄 REVISIONE CONTINUA

**Questa regola deve essere:**
- Riletta all'inizio di ogni sessione
- Aggiornata con nuovi pattern efficaci
- Rigorosamente applicata senza eccezioni
- Referenziata quando si devia dal workflow

**La qualità del lavoro dipende dalla rigidità nell'applicazione di queste regole.**
