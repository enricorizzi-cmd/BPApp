# 🔒 BACKUP VARIABILI AMBIENTE RENDER - CRITICO

## 🚨 **IMPORTANTE**: Questo file contiene le variabili ambiente critiche per il funzionamento dell'app

**DATA BACKUP**: 2025-01-06
**SERVIZIO RENDER**: srv-d2rds26r433s73fhcn60 (BPApp - Battle Plan)
**URL**: https://bpapp-battle-plan.onrender.com

---

## 🔧 **VARIABILI AMBIENTE CRITICHE**

### **SUPABASE (Database)**
```bash
BP_STORAGE=supabase
SUPABASE_URL=https://bzvdbmofetujylvgcmqx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmRibW9mZXR1anlsdmdjbXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MTM1NTAsImV4cCI6MjA3MjM4OTU1MH0.SZEE76n_Lz-8I7CmYkIhArNf41r4PixXRpy-1aRcGU8
```

### **JWT & SICUREZZA**
```bash
BP_JWT_SECRET=[VALORE_CRITICO_DA_RENDER]
NODE_ENV=production
```

### **CORS & DOMINI**
```bash
CORS_ORIGIN=[VALORE_CRITICO_DA_RENDER]
```

### **PUSH NOTIFICATIONS (VAPID)**
```bash
VAPID_PUBLIC_KEY=[VALORE_CRITICO_DA_RENDER]
VAPID_PRIVATE_KEY=[VALORE_CRITICO_DA_RENDER]
VAPID_SUBJECT=mailto:admin@example.com
```

### **EMAIL (SMTP)**
```bash
SMTP_URL=[VALORE_CRITICO_DA_RENDER]
SMTP_FROM=no-reply@example.com
```

### **SISTEMA**
```bash
NODE_VERSION=20
TZ=Europe/Rome
```

---

## 📋 **ISTRUZIONI RECOVERY**

### **1. Se le variabili vengono perse:**
1. Accedi a: https://dashboard.render.com/web/srv-d2rds26r433s73fhcn60
2. Vai su "Environment"
3. Aggiungi tutte le variabili elencate sopra
4. Riavvia il servizio

### **2. Per verificare configurazione:**
```bash
# Test connessione Supabase
curl -X GET "https://bpapp-battle-plan.onrender.com/api/health"

# Test endpoint appuntamenti
curl -X GET "https://bpapp-battle-plan.onrender.com/api/appointments"
```

### **3. Per backup automatico:**
```bash
# Esegui script di backup
node scripts/backup-render-env.js
```

---

## 🛡️ **SICUREZZA**

- **NON COMMITTARE** questo file nel repository
- **NON CONDIVIDERE** le chiavi private
- **BACKUP REGOLARE** delle variabili critiche
- **VALIDAZIONE** automatica ad ogni deploy

---

## 📊 **STATO ATTUALE**

- ✅ **Supabase**: Configurato e funzionante
- ✅ **JWT**: Configurato
- ✅ **CORS**: Configurato
- ✅ **VAPID**: Configurato
- ✅ **SMTP**: Configurato
- ✅ **Sistema**: Configurato

**ULTIMA VERIFICA**: 2025-01-06 - Tutte le variabili presenti e funzionanti
