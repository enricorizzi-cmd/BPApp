# WORKFLOW RULES - IPERPERFORMANTE, ROBUSTO E SICURO

## 🎯 PRINCIPIO FONDAMENTALE
**Ogni task deve essere gestito con approccio sistematico, metodico, completo e OTTIMIZZATO. Nessuna attività deve essere lasciata a metà, approssimata o non performante.**

## 🚀 FILOSOFIA DI LAVORO
- **ZERO TOLERANCE** per errori, regressioni o performance degradate
- **MAXIMUM EFFICIENCY** in ogni operazione e decisione
- **BULLETPROOF SECURITY** per ogni modifica e deploy
- **PROACTIVE MONITORING** con alerting automatico
- **AUTOMATED VALIDATION** per ogni step critico

## 🌐 ARCHITETTURA CLOUD DELL'APPLICAZIONE
**L'applicazione è completamente cloud-based con la seguente architettura:**
- **Frontend/Backend**: Deploy automatico su **Render** (render.com)
- **Database**: **Supabase** PostgreSQL con API REST e Real-time
- **Repository**: **GitHub** per versioning e CI/CD
- **MCP Tools**: Utilizzare sempre i tool specifici per ogni servizio cloud

---

## 📋 WORKFLOW OBBLIGATORIO PER OGNI TASK

### **🚨 REGOLA DEFAULT OBBLIGATORIA - INIZIO TASK**
**PRIMA DI OGNI TASK, SEMPRE E AUTOMATICAMENTE:**
1. **LETTURA AUTOMATICA REGOLE** - Rileggere questo documento WORKFLOW_RULES.md
2. **APPLICAZIONE IMMEDIATA** - Seguire rigorosamente il processo sistematico
3. **CONFERMA COMPRENSIONE** - Dichiarare esplicitamente l'applicazione delle regole

### **🛡️ FASE 0: PRE-SICUREZZA E VALIDAZIONE**
1. **BACKUP AUTOMATICO PRE-TASK**
   - Creare backup completo database Supabase prima di ogni modifica
   - Verificare stato servizi Render (CPU, memoria, errori)
   - Controllare log recenti per anomalie
   - Validare integrità dati con query di controllo

2. **ANALISI IMPATTO SICUREZZA**
   - Identificare potenziali vulnerabilità introdotte
   - Verificare permessi e autenticazione coinvolti
   - Controllare esposizione dati sensibili
   - Valutare impatto su performance e scalabilità

### **FASE 1: ANALISI E PIANIFICAZIONE AVANZATA**
1. **COMPRENSIONE COMPLETA E VALIDAZIONE**
   - Leggere attentamente la richiesta dell'utente
   - Identificare tutti gli aspetti coinvolti (tecnici, business, sicurezza)
   - Chiarire eventuali ambiguità con domande specifiche
   - **VALIDARE** che la richiesta sia tecnicamente fattibile e sicura

2. **CREAZIONE TODO LIST OTTIMIZZATA**
   - Usare `todo_write` con `merge=false` per task complessi (3+ step)
   - Creare task specifici, azionabili, misurabili e **TIMED**
   - Assegnare stato `in_progress` al primo task
   - **AGGIUNGERE** task di validazione e rollback per ogni step critico
   - Aggiornare TODO dopo ogni completamento con timestamp

3. **ANALISI SISTEMATICA E PERFORMANCE**
   - Cercare nel codebase tutti i file/pattern coinvolti
   - Usare `grep`, `codebase_search`, `glob_file_search` per mappare completamente
   - Identificare dipendenze, impatti collaterali e **BOTTLENECK**
   - **ANALIZZARE** impatto su performance (query DB, rendering, API calls)
   - **IDENTIFICARE** punti di fallimento e strategie di recovery

### **FASE 2: IMPLEMENTAZIONE METODICA E SICURA**
1. **APPROCCIO ITERATIVO CON VALIDAZIONE**
   - Un task alla volta, completarlo al 100% prima di passare al successivo
   - Usare `todo_write` per marcare completamenti con timestamp
   - **VALIDARE** ogni modifica con test automatici prima di procedere
   - **ROLLBACK** immediato se test falliscono

2. **MODIFICHE SICURE E PERFORMANTI**
   - Leggere sempre il file completo prima di modificare
   - Usare `search_replace` con contesto sufficiente per unicità
   - **OTTIMIZZARE** query e operazioni per performance
   - Verificare sintassi con `read_lints` dopo modifiche
   - **VALIDARE** sicurezza con controlli automatici
   - Committare ogni gruppo logico di modifiche con messaggi descrittivi

3. **VERIFICA CONTINUA E MONITORAGGIO**
   - Testare funzionalità dopo ogni modifica significativa
   - Verificare che non si siano introdotti regressioni
   - Controllare che tutti i casi edge siano gestiti
   - **MONITORARE** performance in tempo reale
   - **ALERTARE** su anomalie o degradazioni

### **FASE 3: COMPLETAMENTO, VALIDAZIONE E DOCUMENTAZIONE**
1. **TEST FINALE COMPLETO**
   - Verificare che tutti i requisiti siano soddisfatti
   - Testare scenari di utilizzo tipici e edge cases
   - Controllare che l'interfaccia sia coerente e performante
   - **VALIDARE** sicurezza con penetration test automatici
   - **BENCHMARK** performance prima/dopo modifiche

2. **COMMIT E DEPLOY SICURI**
   - Commit con messaggio descrittivo e specifico
   - **VALIDARE** che non ci siano conflitti o errori
   - Push immediato per deploy automatico
   - **MONITORARE** deploy in tempo reale
   - Verificare che il deploy sia completato senza errori

3. **DOCUMENTAZIONE COMPLETA E MONITORAGGIO**
   - Fornire riassunto completo delle modifiche
   - Spiegare la logica implementata e ottimizzazioni
   - Evidenziare eventuali limitazioni o considerazioni
   - **DOCUMENTARE** metriche di performance e sicurezza
   - **IMPLEMENTARE** monitoraggio continuo post-deploy

---

## 🔧 STRUMENTI E PATTERN OBBLIGATORI IPERPERFORMANTI

### **MCP TOOLS CLOUD OBBLIGATORI CON MONITORAGGIO**
```bash
# Per ogni operazione cloud, utilizzare i tool MCP specifici:

# RENDER (Deploy e gestione servizi) - CON MONITORAGGIO CONTINUO
mcp_renderdim_list_services                    # Lista servizi
mcp_renderdim_get_service serviceId            # Dettagli servizio
mcp_renderdim_list_deploys serviceId           # Deploy history
mcp_renderdim_get_metrics resourceId ["cpu_usage", "memory_usage", "http_request_count", "http_latency"]  # Metriche performance
mcp_renderdim_list_logs resource               # Log in tempo reale
mcp_renderdim_get_deploy serviceId deployId    # Dettagli deploy specifico

# SUPABASE (Database e API) - CON VALIDAZIONE SICUREZZA
mcp_supabasedim_list_projects                  # Lista progetti
mcp_supabasedim_execute_sql project_id query   # Query SQL (sempre con LIMIT per performance)
mcp_supabasedim_apply_migration project_id     # Migrazioni DB
mcp_supabasedim_get_logs project_id service    # Log debugging
mcp_supabasedim_get_advisors project_id "security"  # Controllo vulnerabilità
mcp_supabasedim_get_advisors project_id "performance"  # Ottimizzazioni performance

# GITHUB (Repository e versioning) - CON VALIDAZIONE
mcp_github_get_file_contents owner repo path   # Lettura file
mcp_github_create_or_update_file owner repo    # Modifica file
mcp_github_list_commits owner repo             # History commit
mcp_github_create_pull_request owner repo      # Pull request
mcp_github_search_code q="pattern"             # Ricerca codice avanzata
```

### **RICERCA E ANALISI IPERPERFORMANTI**
```bash
# Per ogni task, iniziare con ricerca sistematica e performante:
grep -r "pattern" path/ --include="*.js" --include="*.html" --include="*.css" --include="*.json"  # Ricerca estesa
codebase_search "query semantica" target_directories                    # Ricerca semantica
glob_file_search "pattern" target_directory                            # Ricerca file
grep -n "pattern" file.js | head -20                                   # Ricerca con numeri riga (limitata per performance)

# RICERCA PERFORMANCE E SICUREZZA:
grep -r "TODO\|FIXME\|HACK\|XXX" . --include="*.js" --include="*.html"  # Codice da ottimizzare
grep -r "console\.log\|debugger" . --include="*.js"                    # Debug code da rimuovere
grep -r "password\|secret\|key\|token" . --include="*.js" --include="*.json"  # Credenziali esposte
```

### **MODIFICA SICURA E PERFORMANTE**
```bash
# Sequenza obbligatoria per modifiche locali con validazione:
read_file target_file                    # Leggere sempre prima
search_replace file_path old_string new_string  # Modificare con contesto
read_lints paths                        # Verificare errori
run_terminal_cmd "git add ."           # Staging
run_terminal_cmd "git commit -m 'descrizione specifica'"  # Commit
run_terminal_cmd "git push"            # Deploy automatico su Render

# VALIDAZIONE POST-MODIFICA OBBLIGATORIA:
mcp_renderdim_get_metrics resourceId ["cpu_usage", "memory_usage", "http_request_count"]  # Verifica performance
mcp_supabasedim_get_logs project_id "api"  # Controllo errori API
mcp_supabasedim_get_advisors project_id "security"  # Controllo sicurezza

# Per modifiche cloud dirette:
mcp_github_create_or_update_file owner repo path content message branch  # GitHub
mcp_supabasedim_apply_migration project_id name query                    # Supabase
mcp_renderdim_update_web_service serviceId                              # Render
```

### **GESTIONE TODO OTTIMIZZATA**
```javascript
// All'inizio di task complessi con validazione e rollback:
todo_write(merge=false, todos=[
  {id: "pre_security", content: "Backup e validazione sicurezza pre-task", status: "in_progress"},
  {id: "task1", content: "Descrizione specifica con timeout", status: "pending"},
  {id: "task2", content: "Descrizione specifica con validazione", status: "pending"},
  {id: "post_validation", content: "Test finale e monitoraggio post-deploy", status: "pending"}
])

// Dopo ogni completamento con timestamp:
todo_write(merge=true, todos=[
  {id: "pre_security", status: "completed"},
  {id: "task1", status: "completed", timestamp: "2024-01-01T12:00:00Z"},
  {id: "task2", status: "in_progress"}
])

// ROLLBACK automatico se task critico fallisce:
todo_write(merge=true, todos=[
  {id: "task2", status: "failed", error: "Descrizione errore"},
  {id: "rollback", content: "Rollback modifiche task2", status: "in_progress"}
])
```

---

## 🤖 AUTOMAZIONE E VALIDAZIONE AUTOMATICA

### **VALIDAZIONE AUTOMATICA PRE-TASK**
```bash
# Script di validazione automatica da eseguire PRIMA di ogni task:
function validate_pre_task() {
  echo "🔍 VALIDAZIONE PRE-TASK AUTOMATICA"
  
  # 1. Verifica stato servizi cloud
  mcp_renderdim_list_services | grep -q "running" || { echo "❌ Render services down"; exit 1; }
  mcp_supabasedim_list_projects | grep -q "active" || { echo "❌ Supabase projects inactive"; exit 1; }
  
  # 2. Controllo performance baseline
  mcp_renderdim_get_metrics resourceId ["cpu_usage", "memory_usage"] | grep -E "cpu_usage.*[0-9]{2,}" && echo "⚠️ High CPU usage detected"
  
  # 3. Verifica sicurezza
  mcp_supabasedim_get_advisors project_id "security" | grep -q "No issues" || echo "⚠️ Security issues detected"
  
  # 4. Backup automatico database
  mcp_supabasedim_execute_sql project_id "SELECT COUNT(*) FROM appointments" || { echo "❌ Database backup failed"; exit 1; }
  
  echo "✅ PRE-TASK VALIDATION PASSED"
}
```

### **VALIDAZIONE AUTOMATICA POST-MODIFICA**
```bash
# Script di validazione automatica da eseguire DOPO ogni modifica:
function validate_post_modification() {
  echo "🔍 VALIDAZIONE POST-MODIFICA AUTOMATICA"
  
  # 1. Verifica sintassi e linting
  read_lints paths || { echo "❌ Linting errors found"; exit 1; }
  
  # 2. Test funzionalità critiche
  curl -f https://bpapp-battle-plan.onrender.com/api/health || { echo "❌ API health check failed"; exit 1; }
  
  # 3. Verifica performance non degradata
  mcp_renderdim_get_metrics resourceId ["http_latency"] | grep -E "http_latency.*[0-9]{4,}" && echo "⚠️ High latency detected"
  
  # 4. Controllo errori in log
  mcp_supabasedim_get_logs project_id "api" | grep -i "error" && echo "⚠️ Errors in API logs"
  
  # 5. Verifica sicurezza post-modifica
  mcp_supabasedim_get_advisors project_id "security" | grep -q "No issues" || echo "⚠️ New security issues detected"
  
  echo "✅ POST-MODIFICATION VALIDATION PASSED"
}
```

### **ROLLBACK AUTOMATICO**
```bash
# Script di rollback automatico in caso di fallimento:
function auto_rollback() {
  echo "🔄 ROLLBACK AUTOMATICO ATTIVATO"
  
  # 1. Ripristina ultimo commit stabile
  git log --oneline -5 | grep -E "feat|fix|perf" | head -1 | cut -d' ' -f1 | xargs git revert
  
  # 2. Push rollback
  git push origin main
  
  # 3. Verifica rollback
  sleep 30  # Attendi deploy
  validate_post_modification
  
  # 4. Notifica rollback
  echo "✅ ROLLBACK COMPLETATO - Sistema ripristinato"
}
```

### **MONITORAGGIO CONTINUO AUTOMATICO**
```bash
# Script di monitoraggio continuo da eseguire ogni 5 minuti:
function continuous_monitoring() {
  while true; do
    # 1. Controllo metriche performance
    mcp_renderdim_get_metrics resourceId ["cpu_usage", "memory_usage", "http_request_count"]
    
    # 2. Controllo errori
    mcp_supabasedim_get_logs project_id "api" | tail -20 | grep -i "error"
    
    # 3. Controllo sicurezza
    mcp_supabasedim_get_advisors project_id "security"
    
    # 4. Alert se anomalie
    if [ $? -ne 0 ]; then
      echo "🚨 ANOMALY DETECTED - Sending alert"
      # Qui andrebbe l'invio di alert (email, Slack, etc.)
    fi
    
    sleep 300  # 5 minuti
  done
}
```

---

## 📝 TEMPLATE DI RISPOSTA OBBLIGATORIO

### **INIZIO TASK**
```
🚨 **REGOLA DEFAULT APPLICATA**: WORKFLOW_RULES.md letto e applicato
🤖 **VALIDAZIONE PRE-TASK**: Eseguita automaticamente
🎯 **TASK IDENTIFICATO**: [Descrizione breve]

📋 **PIANO DI LAVORO OTTIMIZZATO**:
1. [Task specifico 1] - IN CORSO ⏱️ [timeout]
2. [Task specifico 2] - PENDING ⏱️ [timeout]
3. [Task specifico 3] - PENDING ⏱️ [timeout]

🔍 **ANALISI INIZIALE AVANZATA**:
- File coinvolti: [lista con impatto performance]
- Pattern da cercare: [lista con ottimizzazioni]
- Dipendenze: [lista con punti di fallimento]
- **SICUREZZA**: [vulnerabilità identificate]
- **PERFORMANCE**: [bottleneck identificati]
- **ROLLBACK**: [strategia di recovery definita]
- MCP Tools necessari: [Render/Supabase/GitHub]
```

### **DURANTE IMPLEMENTAZIONE**
```
✅ **COMPLETATO**: [Task specifico] ⏱️ [tempo impiegato]
🔄 **IN CORSO**: [Task specifico] ⏱️ [tempo rimanente]
⏳ **PENDING**: [Lista task rimanenti]

📝 **MODIFICHE APPORTATE**:
- File: [nome] - [descrizione modifica] - [impatto performance]
- File: [nome] - [descrizione modifica] - [validazione sicurezza]

🤖 **VALIDAZIONE AUTOMATICA**: [stato validazione]
📊 **METRICHE PERFORMANCE**: [CPU/Memory/Latency]
🛡️ **SICUREZZA**: [vulnerabilità risolte/identificate]
```

### **FINE TASK**
```
🎉 **TASK COMPLETATO AL 100%** ⏱️ [tempo totale]

📊 **RIASSUNTO FINALE OTTIMIZZATO**:
- ✅ [Requisito 1] - IMPLEMENTATO - [performance impact]
- ✅ [Requisito 2] - IMPLEMENTATO - [security validation]
- ✅ [Requisito 3] - IMPLEMENTATO - [robustness check]

🔧 **MODIFICHE TECNICHE AVANZATE**:
- [Dettaglio tecnico 1] - [ottimizzazioni applicate]
- [Dettaglio tecnico 2] - [sicurezza implementata]
- [Dettaglio tecnico 3] - [monitoraggio attivato]

🤖 **VALIDAZIONE FINALE**: [tutti i test passati]
📊 **BENCHMARK PERFORMANCE**: [prima/dopo metriche]
🛡️ **SICUREZZA VERIFICATA**: [vulnerabilità risolte]
🔄 **ROLLBACK TESTATO**: [strategia di recovery validata]

🚀 **DEPLOY**: Completato e verificato con monitoraggio continuo
📈 **MONITORAGGIO**: Attivo per 24h post-deploy
```

---

## ⚠️ REGOLE RIGIDE - MAI VIOLARE

### **NON FARE MAI - ZERO TOLERANCE**
- ❌ **INIZIARE TASK SENZA LEGGERE LE REGOLE** - VIOLAZIONE GRAVE
- ❌ **SALTARE VALIDAZIONE PRE-TASK AUTOMATICA** - VIOLAZIONE CRITICA
- ❌ Modificare file senza leggere prima il contenuto completo
- ❌ Committare modifiche senza testare e validare
- ❌ Lasciare task a metà senza aggiornare TODO
- ❌ Usare `replace_all` senza verificare l'impatto
- ❌ Procedere senza aver compreso completamente la richiesta
- ❌ Saltare la verifica con `read_lints`
- ❌ Dimenticare di fare push dopo commit
- ❌ Modificare database Supabase senza backup
- ❌ Deployare su Render senza verificare configurazione
- ❌ Ignorare errori di deploy o metriche anomale
- ❌ **IGNORARE ALERT DI SICUREZZA O PERFORMANCE**
- ❌ **DEPLOYARE SENZA MONITORAGGIO CONTINUO**
- ❌ **MODIFICARE SENZA ROLLBACK PLAN DEFINITO**

### **SEMPRE FARE - OBBLIGATORIO**
- ✅ **LETTURA AUTOMATICA REGOLE** all'inizio di ogni task
- ✅ **ESEGUIRE VALIDAZIONE PRE-TASK AUTOMATICA**
- ✅ Creare TODO per task complessi con timeout
- ✅ Leggere file completo prima di modificare
- ✅ Usare contesto sufficiente in `search_replace`
- ✅ Verificare con `read_lints` dopo modifiche
- ✅ **VALIDARE SICUREZZA CON MCP TOOLS**
- ✅ Committare con messaggi descrittivi
- ✅ Fare push immediato per deploy automatico su Render
- ✅ Utilizzare MCP tools specifici per operazioni cloud
- ✅ **MONITORARE DEPLOY IN TEMPO REALE**
- ✅ Controllare log Supabase per errori database
- ✅ **IMPLEMENTARE MONITORAGGIO CONTINUO POST-DEPLOY**
- ✅ Fornire riassunto completo alla fine
- ✅ Aggiornare TODO dopo ogni completamento
- ✅ **DOCUMENTARE METRICHE PERFORMANCE E SICUREZZA**

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
3. Verificare stato servizi cloud (Render/Supabase)
4. Implementazione step-by-step
5. Aggiornamento TODO continuo
6. Test finale completo
7. Deploy automatico via GitHub → Render
8. Verifica deploy e metriche
9. Controllo log Supabase per errori
10. Documentazione completa
```

---

## ☁️ WORKFLOW CLOUD SPECIFICO

### **DEPLOY AUTOMATICO**
```bash
# Il deploy avviene automaticamente tramite:
GitHub Push → Render Webhook → Deploy Automatico

# Verifica deploy:
mcp_renderdim_list_deploys serviceId
mcp_renderdim_get_deploy serviceId deployId
mcp_renderdim_get_metrics resourceId
```

### **GESTIONE DATABASE SUPABASE**
```bash
# Prima di modifiche database:
mcp_supabasedim_list_projects
mcp_supabasedim_execute_sql project_id "SELECT * FROM table LIMIT 5"

# Per migrazioni:
mcp_supabasedim_apply_migration project_id "migration_name" "SQL_QUERY"

# Debugging:
mcp_supabasedim_get_logs project_id "postgres"
mcp_supabasedim_get_advisors project_id "security"
```

### **MONITORAGGIO CONTINUO**
```bash
# Verifiche post-deploy obbligatorie:
mcp_renderdim_get_metrics resourceId ["cpu_usage", "memory_usage", "http_request_count"]
mcp_supabasedim_get_logs project_id "api"
mcp_github_list_commits owner repo
```

---

## 📊 MONITORAGGIO AVANZATO E ALERTING

### **METRICHE CRITICHE DA MONITORARE**
```bash
# Performance Metrics (ogni 5 minuti)
- CPU Usage: < 80%
- Memory Usage: < 85%
- HTTP Latency: < 500ms
- Error Rate: < 1%
- Response Time: < 2s

# Security Metrics (ogni 15 minuti)
- Failed Authentication: < 5/min
- SQL Injection Attempts: 0
- XSS Attempts: 0
- Rate Limiting Triggers: < 10/min

# Business Metrics (ogni ora)
- Active Users: baseline ± 20%
- API Calls: baseline ± 30%
- Database Queries: < 1000/min
- Storage Usage: < 90%
```

### **ALERTING AUTOMATICO**
```bash
# Alert Levels
🚨 CRITICAL: Sistema down, data loss, security breach
⚠️ WARNING: Performance degradation, high error rate
ℹ️ INFO: Deploy completato, metriche normali

# Alert Channels
- Console: Immediato per tutti gli alert
- Log: Persistente per audit
- Dashboard: Visualizzazione real-time
```

### **RECOVERY AUTOMATICO**
```bash
# Auto-Recovery Triggers
- High CPU (>90%): Scale up automatico
- High Memory (>95%): Restart servizio
- High Error Rate (>5%): Rollback automatico
- Security Breach: Isolamento immediato
```

---

## 🔄 REVISIONE CONTINUA E OTTIMIZZAZIONE

**Questa regola deve essere:**
- Riletta all'inizio di ogni sessione
- Aggiornata con nuovi pattern efficaci
- Rigorosamente applicata senza eccezioni
- Referenziata quando si devia dal workflow
- **OTTIMIZZATA** continuamente basandosi su metriche
- **EVOLUTA** con nuove tecnologie e best practices

**La qualità del lavoro dipende dalla rigidità nell'applicazione di queste regole e dalla continua ottimizzazione basata sui dati.**

## 🏆 OBIETTIVI FINALI

**ZERO DOWNTIME** - Sistema sempre disponibile
**ZERO DATA LOSS** - Integrità dati garantita
**ZERO SECURITY BREACHES** - Sicurezza massima
**MAXIMUM PERFORMANCE** - Ottimizzazione continua
**AUTOMATED RECOVERY** - Resilienza automatica
