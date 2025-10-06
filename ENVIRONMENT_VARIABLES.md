# 🔧 VARIABILI AMBIENTE - DOCUMENTAZIONE COMPLETA

## 🎯 **SCOPO**
Documentazione completa di tutte le variabili ambiente necessarie per il funzionamento dell'applicazione BPApp.

---

## 🗄️ **SUPABASE (Database)**

### **Variabili Obbligatorie**
```bash
# Forza uso Supabase come storage
BP_STORAGE=supabase

# URL del progetto Supabase
SUPABASE_URL=https://bzvdbmofetujylvgcmqx.supabase.co

# Chiave anonima Supabase (pubblica, sicura per frontend)
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmRibW9mZXR1anlsdmdjbXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MTM1NTAsImV4cCI6MjA3MjM4OTU1MH0.SZEE76n_Lz-8I7CmYkIhArNf41r4PixXRpy-1aRcGU8
```

### **Descrizione**
- **BP_STORAGE**: Forza l'applicazione a usare Supabase invece di SQLite locale
- **SUPABASE_URL**: Endpoint API del progetto Supabase
- **SUPABASE_ANON_KEY**: Chiave pubblica per autenticazione API (sicura per frontend)

---

## 🔐 **JWT & SICUREZZA**

### **Variabili Obbligatorie**
```bash
# Chiave segreta per firma JWT (CRITICA - NON CONDIVIDERE)
BP_JWT_SECRET=[CHIAVE_SEGRETA_32_CARATTERI_MINIMO]

# Ambiente di esecuzione
NODE_ENV=production
```

### **Descrizione**
- **BP_JWT_SECRET**: Chiave segreta per firmare i token JWT (deve essere lunga e casuale)
- **NODE_ENV**: Ambiente di esecuzione (production/development)

---

## 🌐 **CORS & DOMINI**

### **Variabili Obbligatorie**
```bash
# Domini autorizzati per CORS
CORS_ORIGIN=https://bpapp-battle-plan.onrender.com,http://localhost:3000
```

### **Descrizione**
- **CORS_ORIGIN**: Domini autorizzati per le richieste cross-origin (separati da virgola)

---

## 📱 **PUSH NOTIFICATIONS (VAPID)**

### **Variabili Obbligatorie**
```bash
# Chiave pubblica VAPID
VAPID_PUBLIC_KEY=[CHIAVE_PUBBLICA_VAPID]

# Chiave privata VAPID (CRITICA - NON CONDIVIDERE)
VAPID_PRIVATE_KEY=[CHIAVE_PRIVATA_VAPID]

# Soggetto VAPID
VAPID_SUBJECT=mailto:admin@example.com
```

### **Descrizione**
- **VAPID_PUBLIC_KEY**: Chiave pubblica per Web Push (sicura per frontend)
- **VAPID_PRIVATE_KEY**: Chiave privata per Web Push (CRITICA)
- **VAPID_SUBJECT**: Identificatore del server per Web Push

---

## 📧 **EMAIL (SMTP)**

### **Variabili Obbligatorie**
```bash
# URL connessione SMTP
SMTP_URL=smtps://username:password@smtp.gmail.com:465

# Indirizzo mittente email
SMTP_FROM=no-reply@example.com
```

### **Descrizione**
- **SMTP_URL**: URL completo per connessione SMTP (include credenziali)
- **SMTP_FROM**: Indirizzo email del mittente

---

## ⚙️ **SISTEMA**

### **Variabili Obbligatorie**
```bash
# Versione Node.js
NODE_VERSION=20

# Timezone
TZ=Europe/Rome
```

### **Descrizione**
- **NODE_VERSION**: Versione Node.js da utilizzare
- **TZ**: Timezone del server

---

## 🚫 **VARIABILI NON UTILIZZATE**

### **Postgres Render (NON USARE)**
```bash
# NON CONFIGURARE - App usa solo Supabase
PG_URL=[NON_USARE]
DATABASE_URL=[NON_USARE]
```

---

## 🔍 **VALIDAZIONE**

### **Script di Validazione**
```bash
# Valida configurazione locale
node scripts/validate-render-env.js

# Crea backup variabili
node scripts/backup-render-env.js
```

### **Test Manuali**
```bash
# Test Health Check
curl https://bpapp-battle-plan.onrender.com/api/health

# Test Appuntamenti (richiede auth)
curl https://bpapp-battle-plan.onrender.com/api/appointments
```

---

## 🛡️ **SICUREZZA**

### **Variabili Critiche (NON CONDIVIDERE)**
- `BP_JWT_SECRET`
- `VAPID_PRIVATE_KEY`
- `SMTP_URL` (contiene password)

### **Variabili Pubbliche (Sicure)**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `VAPID_PUBLIC_KEY`
- `CORS_ORIGIN`

---

## 📋 **CHECKLIST DEPLOY**

### **Prima del Deploy**
- [ ] Tutte le variabili critiche configurate su Render
- [ ] Test di validazione superato
- [ ] Backup variabili creato
- [ ] Documentazione aggiornata

### **Dopo il Deploy**
- [ ] Health check OK
- [ ] Connessione Supabase funzionante
- [ ] Push notifications testate
- [ ] Email funzionante

---

## 🔄 **RECOVERY**

### **Se le variabili vengono perse**
1. Accedi a Render Dashboard
2. Vai su Environment del servizio
3. Ripristina tutte le variabili da `RENDER_ENV_BACKUP.md`
4. Riavvia il servizio
5. Esegui test di validazione

### **Script di Recovery**
```bash
# Valida configurazione attuale
node scripts/validate-render-env.js

# Se fallisce, ripristina da backup
# (Manuale - non automatizzabile per sicurezza)
```
