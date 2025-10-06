# CURSOR WORKSPACE RULES - INTEGRAZIONE WORKFLOW_RULES

## 🎯 SCOPO
Questo file integra le WORKFLOW_RULES.md nelle impostazioni di Cursor IDE per applicarle automaticamente ad ogni sessione di lavoro.

## 🚨 REGOLA PRINCIPALE
**OGNI TASK DEVE SEGUIRE LE WORKFLOW_RULES.md RIGOROSAMENTE**

## 📋 INTEGRAZIONE AUTOMATICA

### **System Prompt Integrato**
Le regole sono integrate nel system prompt di Cursor attraverso `.cursor/settings.json`:
- Filosofia di lavoro obbligatoria
- Workflow sistematico a 3 fasi
- Regole rigide di sicurezza
- Template di risposta strutturati
- Obiettivi finali di qualità

### **Configurazione Workspace**
- **Model**: Claude 3.5 Sonnet (ottimizzato per codice)
- **Temperature**: 0.1 (massima precisione)
- **Max Tokens**: 4000 (sufficiente per task complessi)
- **Codebase Indexing**: Abilitato
- **Semantic Search**: Abilitato
- **Auto Save**: Abilitato
- **Linting**: Abilitato
- **Testing**: Abilitato
- **Security Scan**: Abilitato
- **Performance Monitoring**: Abilitato

### **Priorità Workspace**
1. **Security and data integrity** (massima priorità)
2. **Performance optimization**
3. **Code quality and maintainability**
4. **User experience and functionality**
5. **Documentation and monitoring**

### **Architettura Cloud**
- **Frontend**: Vite + Vanilla JS
- **Backend**: Node.js + Express
- **Database**: Supabase PostgreSQL
- **Deployment**: Render.com
- **Versioning**: GitHub
- **Monitoring**: Render Metrics + Supabase Logs

### **MCP Tools Configurati**
- **Render**: Servizi, metriche, log, deploy
- **Supabase**: SQL, migrazioni, log, advisor
- **GitHub**: File, commit, repository

### **Monitoraggio Automatico**
- **Performance**: CPU <80%, Memory <85%, Latency <500ms
- **Security**: Auth failures <5/min, 0 injection attempts
- **Business**: Users ±20%, API calls ±30%, DB queries <1000/min

## 🔄 COME FUNZIONA

1. **Avvio Cursor**: Le regole vengono caricate automaticamente
2. **System Prompt**: Include tutte le WORKFLOW_RULES
3. **Ogni Task**: Segue automaticamente il workflow sistematico
4. **Validazione**: Controlli automatici di sicurezza e performance
5. **Monitoraggio**: Alerting continuo su anomalie

## ✅ BENEFICI

- **Consistenza**: Ogni task segue lo stesso standard
- **Sicurezza**: Controlli automatici integrati
- **Performance**: Ottimizzazioni automatiche
- **Qualità**: Zero tolerance per errori
- **Efficienza**: Workflow ottimizzato e automatizzato

## 🚀 UTILIZZO

Le regole sono ora **ATTIVE DI DEFAULT** in questo workspace Cursor. Ogni volta che apri Cursor in questa cartella, le WORKFLOW_RULES vengono applicate automaticamente.

**Non serve fare nulla di aggiuntivo - tutto è già configurato!** 🎯
