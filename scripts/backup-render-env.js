#!/usr/bin/env node

/**
 * 🔒 SCRIPT BACKUP VARIABILI AMBIENTE RENDER
 * 
 * Questo script crea un backup delle variabili ambiente critiche
 * per prevenire la perdita di configurazione su Render.
 */

const fs = require('fs');
const path = require('path');

// Configurazione
const BACKUP_DIR = path.join(__dirname, '..', 'backups', 'env-backups');
const BACKUP_FILE = path.join(BACKUP_DIR, `render-env-backup-${new Date().toISOString().split('T')[0]}.json`);

// Variabili ambiente critiche (da aggiornare manualmente se necessario)
const CRITICAL_ENV_VARS = {
  // Supabase
  'BP_STORAGE': 'supabase',
  'SUPABASE_URL': 'https://bzvdbmofetujylvgcmqx.supabase.co',
  'SUPABASE_ANON_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmRibW9mZXR1anlsdmdjbXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MTM1NTAsImV4cCI6MjA3MjM4OTU1MH0.SZEE76n_Lz-8I7CmYkIhArNf41r4PixXRpy-1aRcGU8',
  
  // Sistema
  'NODE_ENV': 'production',
  'NODE_VERSION': '20',
  'TZ': 'Europe/Rome',
  
  // VAPID
  'VAPID_SUBJECT': 'mailto:admin@example.com',
  
  // SMTP
  'SMTP_FROM': 'no-reply@example.com',
  
  // Variabili che devono essere configurate su Render (placeholder)
  'BP_JWT_SECRET': '[CONFIGURATO_SU_RENDER]',
  'CORS_ORIGIN': '[CONFIGURATO_SU_RENDER]',
  'VAPID_PUBLIC_KEY': '[CONFIGURATO_SU_RENDER]',
  'VAPID_PRIVATE_KEY': '[CONFIGURATO_SU_RENDER]',
  'SMTP_URL': '[CONFIGURATO_SU_RENDER]'
};

function createBackup() {
  try {
    // Crea directory backup se non esiste
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    // Crea oggetto backup
    const backup = {
      timestamp: new Date().toISOString(),
      service: 'srv-d2rds26r433s73fhcn60',
      serviceName: 'BPApp - Battle Plan',
      url: 'https://bpapp-battle-plan.onrender.com',
      environment: 'production',
      variables: CRITICAL_ENV_VARS,
      notes: [
        'Backup automatico delle variabili ambiente critiche',
        'Aggiornare manualmente i valori [CONFIGURATO_SU_RENDER] con i valori reali',
        'NON committare questo file nel repository',
        'Usare per recovery in caso di perdita configurazione'
      ]
    };
    
    // Salva backup
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
    
    console.log('🔒 BACKUP VARIABILI AMBIENTE COMPLETATO');
    console.log(`📁 File: ${BACKUP_FILE}`);
    console.log(`📊 Variabili: ${Object.keys(CRITICAL_ENV_VARS).length}`);
    console.log(`⏰ Timestamp: ${backup.timestamp}`);
    
    // Crea anche un file di backup sempre aggiornato
    const latestBackup = path.join(BACKUP_DIR, 'render-env-latest.json');
    fs.writeFileSync(latestBackup, JSON.stringify(backup, null, 2));
    console.log(`🔄 Backup latest: ${latestBackup}`);
    
  } catch (error) {
    console.error('❌ ERRORE BACKUP:', error.message);
    process.exit(1);
  }
}

function validateEnvironment() {
  console.log('🔍 VALIDAZIONE VARIABILI AMBIENTE...');
  
  const missing = [];
  const present = [];
  
  Object.keys(CRITICAL_ENV_VARS).forEach(key => {
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  });
  
  console.log(`✅ Presenti: ${present.length} variabili`);
  console.log(`❌ Mancanti: ${missing.length} variabili`);
  
  if (missing.length > 0) {
    console.log('⚠️  VARIABILI MANCANTI:');
    missing.forEach(key => {
      console.log(`   - ${key}`);
    });
  }
  
  return missing.length === 0;
}

// Esegui script
if (require.main === module) {
  console.log('🚀 AVVIO BACKUP VARIABILI AMBIENTE RENDER');
  console.log('=' .repeat(50));
  
  // Valida ambiente locale
  const isValid = validateEnvironment();
  
  // Crea backup
  createBackup();
  
  if (!isValid) {
    console.log('⚠️  ATTENZIONE: Alcune variabili non sono configurate localmente');
    console.log('   Questo è normale se stai eseguendo il backup da locale');
  }
  
  console.log('=' .repeat(50));
  console.log('✅ BACKUP COMPLETATO CON SUCCESSO');
}

module.exports = { createBackup, validateEnvironment, CRITICAL_ENV_VARS };
