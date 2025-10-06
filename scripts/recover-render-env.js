#!/usr/bin/env node

/**
 * 🔄 SCRIPT RECOVERY VARIABILI AMBIENTE RENDER
 * 
 * Questo script aiuta nel recovery delle variabili ambiente
 * in caso di perdita o corruzione della configurazione.
 */

const fs = require('fs');
const path = require('path');
const { CRITICAL_ENV_VARS } = require('./backup-render-env');

// Configurazione
const BACKUP_DIR = path.join(__dirname, '..', 'backups', 'env-backups');
const LATEST_BACKUP = path.join(BACKUP_DIR, 'render-env-latest.json');

function loadLatestBackup() {
  try {
    if (!fs.existsSync(LATEST_BACKUP)) {
      console.error('❌ Nessun backup trovato. Esegui prima: node scripts/backup-render-env.js');
      return null;
    }
    
    const backup = JSON.parse(fs.readFileSync(LATEST_BACKUP, 'utf8'));
    console.log(`📁 Backup caricato: ${backup.timestamp}`);
    return backup;
  } catch (error) {
    console.error('❌ Errore caricamento backup:', error.message);
    return null;
  }
}

function generateRecoveryInstructions(backup) {
  console.log('🔄 ISTRUZIONI RECOVERY VARIABILI AMBIENTE');
  console.log('=' .repeat(60));
  console.log('');
  console.log('📋 PASSO 1: Accedi al Dashboard Render');
  console.log('   URL: https://dashboard.render.com/web/srv-d2rds26r433s73fhcn60');
  console.log('');
  console.log('📋 PASSO 2: Vai su "Environment"');
  console.log('   Clicca sulla scheda "Environment" nel menu laterale');
  console.log('');
  console.log('📋 PASSO 3: Aggiungi/Ripristina le variabili:');
  console.log('');
  
  Object.entries(backup.variables).forEach(([key, value]) => {
    if (value.startsWith('[CONFIGURATO_SU_RENDER]')) {
      console.log(`   ⚠️  ${key}: [VALORE_DA_RECUPERARE_DA_RENDER]`);
    } else {
      console.log(`   ✅ ${key}: ${value}`);
    }
  });
  
  console.log('');
  console.log('📋 PASSO 4: Riavvia il servizio');
  console.log('   Clicca su "Manual Deploy" o aspetta il deploy automatico');
  console.log('');
  console.log('📋 PASSO 5: Verifica il funzionamento');
  console.log('   Esegui: node scripts/validate-render-env.js');
  console.log('');
}

function generateEnvFile(backup) {
  const envContent = Object.entries(backup.variables)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  const envFile = path.join(__dirname, '..', '.env.recovery');
  fs.writeFileSync(envFile, envContent);
  
  console.log(`📄 File .env generato: ${envFile}`);
  console.log('⚠️  ATTENZIONE: Questo file contiene informazioni sensibili!');
  console.log('   - NON committarlo nel repository');
  console.log('   - Eliminalo dopo il recovery');
  console.log('');
}

function showCurrentStatus() {
  console.log('🔍 STATO ATTUALE VARIABILI AMBIENTE:');
  console.log('');
  
  const criticalVars = [
    'BP_STORAGE',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'BP_JWT_SECRET',
    'NODE_ENV',
    'CORS_ORIGIN',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'SMTP_URL'
  ];
  
  criticalVars.forEach(key => {
    const value = process.env[key];
    if (value) {
      console.log(`   ✅ ${key}: ${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`);
    } else {
      console.log(`   ❌ ${key}: MANCANTE`);
    }
  });
  
  console.log('');
}

function main() {
  console.log('🔄 RECOVERY VARIABILI AMBIENTE RENDER');
  console.log('=' .repeat(60));
  console.log('');
  
  // Mostra stato attuale
  showCurrentStatus();
  
  // Carica backup
  const backup = loadLatestBackup();
  if (!backup) {
    return;
  }
  
  console.log('');
  console.log('📊 INFORMAZIONI BACKUP:');
  console.log(`   Servizio: ${backup.serviceName}`);
  console.log(`   URL: ${backup.url}`);
  console.log(`   Timestamp: ${backup.timestamp}`);
  console.log(`   Variabili: ${Object.keys(backup.variables).length}`);
  console.log('');
  
  // Genera istruzioni recovery
  generateRecoveryInstructions(backup);
  
  // Genera file .env per riferimento
  generateEnvFile(backup);
  
  console.log('🎯 PROSSIMI PASSI:');
  console.log('   1. Segui le istruzioni sopra per ripristinare le variabili');
  console.log('   2. Verifica con: node scripts/validate-render-env.js');
  console.log('   3. Elimina il file .env.recovery dopo il recovery');
  console.log('');
  console.log('✅ RECOVERY INSTRUCTION GENERATE');
}

// Esegui script
if (require.main === module) {
  main();
}

module.exports = { loadLatestBackup, generateRecoveryInstructions, showCurrentStatus };
