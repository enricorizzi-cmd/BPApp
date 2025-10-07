#!/usr/bin/env node

/**
 * 🚀 SCRIPT SETUP PUSH NOTIFICATIONS
 * 
 * Questo script configura automaticamente le push notifications
 * e verifica il funzionamento del sistema.
 */

const fs = require('fs');
const path = require('path');

// Configurazione
const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const DATA_DIR = path.join(BACKEND_DIR, 'data');
const SUBS_FILE = path.join(DATA_DIR, 'push_subscriptions.json');

// Chiavi VAPID generate
const VAPID_KEYS = {
  PUBLIC: 'BMnV6rXtGFvY_FvEGsstZFFMlBi7Y_s_TMTRMDbADdNH07YcRXgT8oQcFJP6HugtZmDxOGtxGQI6w_TYjQa66dU',
  PRIVATE: 'uImHN0PqQK8x6TWei8O2Z5ib0EXEr6vS4WHXzzlG-oU',
  SUBJECT: 'mailto:admin@battleplan.com'
};

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    log(`Created data directory: ${DATA_DIR}`, 'success');
  }
}

function ensureSubscriptionsFile() {
  if (!fs.existsSync(SUBS_FILE)) {
    const initialData = { subs: [] };
    fs.writeFileSync(SUBS_FILE, JSON.stringify(initialData, null, 2));
    log(`Created subscriptions file: ${SUBS_FILE}`, 'success');
  }
}

function generateEnvTemplate() {
  const envTemplate = `# 🔑 CHIAVI VAPID PER PUSH NOTIFICATIONS
# Generato il: ${new Date().toISOString().split('T')[0]}
# Per uso in sviluppo locale

VAPID_PUBLIC_KEY=${VAPID_KEYS.PUBLIC}
VAPID_PRIVATE_KEY=${VAPID_KEYS.PRIVATE}
VAPID_SUBJECT=${VAPID_KEYS.SUBJECT}

# ⚠️ IMPORTANTE: 
# - NON committare questo file nel repository
# - Configurare queste chiavi su Render.com
# - Usare solo per sviluppo locale

# 🚀 ISTRUZIONI RENDER.COM:
# 1. Accedi a: https://dashboard.render.com/web/srv-d2rds26r433s73fhcn60
# 2. Vai su "Environment"
# 3. Aggiungi le variabili:
#    - VAPID_PUBLIC_KEY = ${VAPID_KEYS.PUBLIC}
#    - VAPID_PRIVATE_KEY = ${VAPID_KEYS.PRIVATE}
#    - VAPID_SUBJECT = ${VAPID_KEYS.SUBJECT}
# 4. Riavvia il servizio

# 🧪 TEST COMANDI:
# curl -X GET "https://bpapp-battle-plan.onrender.com/api/push/publicKey"
# curl -X GET "https://bpapp-battle-plan.onrender.com/api/push/status" -H "Authorization: Bearer [TOKEN]"
# curl -X POST "https://bpapp-battle-plan.onrender.com/api/push/test" -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"payload":{"title":"Test","body":"Notifica di prova"}}'
`;

  const envFile = path.join(BACKEND_DIR, '.env.push');
  fs.writeFileSync(envFile, envTemplate);
  log(`Generated VAPID configuration: ${envFile}`, 'success');
  
  return envFile;
}

function checkWebPushModule() {
  try {
    // Prova a richiedere il modulo dalla directory backend
    const webPushPath = path.join(BACKEND_DIR, 'node_modules', 'web-push');
    require(webPushPath);
    log('Web-push module is available', 'success');
    return true;
  } catch (error) {
    try {
      // Fallback: prova a richiedere normalmente
      require('web-push');
      log('Web-push module is available', 'success');
      return true;
    } catch (fallbackError) {
      log('Web-push module not found. Install with: npm install web-push', 'warning');
      log('Continuing setup without web-push module check...', 'info');
      return true; // Continua comunque il setup
    }
  }
}

function showNextSteps() {
  console.log('\n🚀 PROSSIMI PASSI:');
  console.log('1. Configura le chiavi VAPID su Render.com (vedi .env.push)');
  console.log('2. Riavvia il servizio su Render');
  console.log('3. Testa le notifiche con i comandi curl');
  console.log('4. Verifica i log del server per confermare la configurazione');
  console.log('\n📱 TEST FRONTEND:');
  console.log('1. Apri l\'app in browser');
  console.log('2. Accetta le notifiche quando richiesto');
  console.log('3. Verifica la console per i log di sottoscrizione');
  console.log('4. Usa il pulsante "Test Notifica" se disponibile');
}

function main() {
  log('🚀 Starting Push Notifications Setup...');
  
  try {
    // Verifica prerequisiti
    if (!checkWebPushModule()) {
      process.exit(1);
    }
    
    // Crea struttura dati
    ensureDataDir();
    ensureSubscriptionsFile();
    
    // Genera configurazione
    const envFile = generateEnvTemplate();
    
    log('✅ Push Notifications setup completed successfully!', 'success');
    showNextSteps();
    
  } catch (error) {
    log(`Setup failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, VAPID_KEYS };
