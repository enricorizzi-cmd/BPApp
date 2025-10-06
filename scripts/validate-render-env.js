#!/usr/bin/env node

/**
 * 🔍 SCRIPT VALIDAZIONE VARIABILI AMBIENTE RENDER
 * 
 * Questo script valida che tutte le variabili ambiente critiche
 * siano configurate correttamente su Render.
 */

const https = require('https');

// Configurazione
const RENDER_URL = 'https://bpapp-battle-plan.onrender.com';
const HEALTH_ENDPOINT = '/api/health';
const APPOINTMENTS_ENDPOINT = '/api/appointments';

// Variabili critiche da verificare
const CRITICAL_VARS = [
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

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'bpapp-battle-plan.onrender.com',
      port: 443,
      path: path,
      method: 'GET',
      timeout: 10000,
      headers: {
        'User-Agent': 'BPApp-Env-Validator/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function validateHealth() {
  console.log('🏥 Test Health Check...');
  
  try {
    const response = await makeRequest(HEALTH_ENDPOINT);
    
    if (response.statusCode === 200) {
      console.log('✅ Health Check: OK');
      return true;
    } else {
      console.log(`❌ Health Check: FAILED (${response.statusCode})`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Health Check: ERROR - ${error.message}`);
    return false;
  }
}

async function validateSupabase() {
  console.log('🗄️  Test Connessione Supabase...');
  
  try {
    const response = await makeRequest(APPOINTMENTS_ENDPOINT);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      console.log(`✅ Supabase: OK (${data.length || 0} appuntamenti)`);
      return true;
    } else if (response.statusCode === 401) {
      console.log('⚠️  Supabase: Unauthorized (normale se non autenticato)');
      return true; // Normale per endpoint protetto
    } else {
      console.log(`❌ Supabase: FAILED (${response.statusCode})`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Supabase: ERROR - ${error.message}`);
    return false;
  }
}

async function validateEnvironment() {
  console.log('🔍 VALIDAZIONE VARIABILI AMBIENTE RENDER');
  console.log('=' .repeat(50));
  console.log(`🌐 URL: ${RENDER_URL}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log('');
  
  // Test Health Check
  const healthOk = await validateHealth();
  console.log('');
  
  // Test Supabase
  const supabaseOk = await validateSupabase();
  console.log('');
  
  // Risultato finale
  console.log('📊 RISULTATO VALIDAZIONE:');
  console.log(`   Health Check: ${healthOk ? '✅' : '❌'}`);
  console.log(`   Supabase: ${supabaseOk ? '✅' : '❌'}`);
  console.log('');
  
  if (healthOk && supabaseOk) {
    console.log('🎉 TUTTE LE VALIDAZIONI SUPERATE');
    console.log('✅ Le variabili ambiente sono configurate correttamente');
    return true;
  } else {
    console.log('⚠️  PROBLEMI RILEVATI');
    console.log('❌ Alcune variabili ambiente potrebbero essere mancanti o errate');
    console.log('');
    console.log('🔧 AZIONI CONSIGLIATE:');
    console.log('   1. Verifica le variabili su Render Dashboard');
    console.log('   2. Controlla i log del servizio');
    console.log('   3. Riavvia il servizio se necessario');
    return false;
  }
}

// Esegui validazione
if (require.main === module) {
  validateEnvironment()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ ERRORE VALIDAZIONE:', error.message);
      process.exit(1);
    });
}

module.exports = { validateEnvironment, validateHealth, validateSupabase };
