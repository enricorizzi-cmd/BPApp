#!/usr/bin/env node

/**
 * BPApp - Timezone Migration Script
 * 
 * Migra i dati esistenti degli appuntamenti dal formato misto locale/UTC
 * al nuovo formato standardizzato UTC.
 * 
 * Usage: node migrate-timezone.js
 */

const fs = require('fs').promises;
const path = require('path');
const { parseDateTime, toUTCString, isValidDateTime } = require('./lib/timezone');

const DATA_DIR = path.join(__dirname, 'data');
const APPOINTMENTS_FILE = path.join(DATA_DIR, 'appointments.json');
const BACKUP_FILE = path.join(DATA_DIR, 'appointments.backup.json');

// eslint-disable-next-line complexity
async function migrateAppointments() {
  console.log('🔄 Avvio migrazione timezone appuntamenti...');
  
  try {
    // Leggi i dati esistenti
    const data = await fs.readFile(APPOINTMENTS_FILE, 'utf8');
    const appointments = JSON.parse(data);
    
    if (!appointments.appointments || !Array.isArray(appointments.appointments)) {
      console.log('❌ Formato file appointments.json non valido');
      return;
    }
    
    console.log(`📊 Trovati ${appointments.appointments.length} appuntamenti da migrare`);
    
    // Crea backup
    await fs.writeFile(BACKUP_FILE, data);
    console.log(`💾 Backup creato: ${BACKUP_FILE}`);
    
    let migrated = 0;
    let errors = 0;
    const issues = [];
    
    // Migra ogni appuntamento
    for (const appt of appointments.appointments) {
      try {
        const originalStart = appt.start;
        const originalEnd = appt.end;
        
        // Parse e converte start
        const startDate = parseDateTime(originalStart);
        if (isNaN(startDate)) {
          issues.push(`Appuntamento ${appt.id}: start invalido "${originalStart}"`);
          errors++;
          continue;
        }
        
        // Parse e converte end
        let endDate = null;
        if (originalEnd) {
          endDate = parseDateTime(originalEnd);
          if (isNaN(endDate)) {
            issues.push(`Appuntamento ${appt.id}: end invalido "${originalEnd}"`);
            errors++;
            continue;
          }
        }
        
        // Aggiorna i campi
        appt.start = toUTCString(startDate);
        if (endDate) {
          appt.end = toUTCString(endDate);
        }
        
        // Ricalcola durationMinutes se necessario
        if (endDate && (!appt.durationMinutes || appt.durationMinutes <= 0)) {
          appt.durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
        }
        
        migrated++;
        
        // Log dettagli per debug
        if (originalStart !== appt.start || originalEnd !== appt.end) {
          console.log(`✅ ${appt.id}: ${originalStart} → ${appt.start}, ${originalEnd || 'null'} → ${appt.end || 'null'}`);
        }
        
      } catch (error) {
        issues.push(`Appuntamento ${appt.id}: errore durante migrazione - ${error.message}`);
        errors++;
      }
    }
    
    // Salva i dati migrati
    await fs.writeFile(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2));
    
    console.log(`\n📈 Migrazione completata:`);
    console.log(`   ✅ Migrati: ${migrated}`);
    console.log(`   ❌ Errori: ${errors}`);
    
    if (issues.length > 0) {
      console.log(`\n⚠️  Problemi riscontrati:`);
      issues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    console.log(`\n💾 Dati salvati in: ${APPOINTMENTS_FILE}`);
    console.log(`🔄 Backup disponibile in: ${BACKUP_FILE}`);
    
  } catch (error) {
    console.error('❌ Errore durante la migrazione:', error.message);
    process.exit(1);
  }
}

async function validateMigration() {
  console.log('\n🔍 Validazione migrazione...');
  
  try {
    const data = await fs.readFile(APPOINTMENTS_FILE, 'utf8');
    const appointments = JSON.parse(data);
    
    let validCount = 0;
    let invalidCount = 0;
    
    for (const appt of appointments.appointments) {
      const startValid = isValidDateTime(appt.start);
      const endValid = !appt.end || isValidDateTime(appt.end);
      
      if (startValid && endValid) {
        validCount++;
      } else {
        invalidCount++;
        console.log(`❌ Appuntamento ${appt.id} non valido dopo migrazione`);
      }
    }
    
    console.log(`✅ Validati: ${validCount}`);
    console.log(`❌ Non validi: ${invalidCount}`);
    
    if (invalidCount === 0) {
      console.log('🎉 Migrazione validata con successo!');
    } else {
      console.log('⚠️  Alcuni appuntamenti necessitano correzione manuale');
    }
    
  } catch (error) {
    console.error('❌ Errore durante validazione:', error.message);
  }
}

// Esegui migrazione
if (require.main === module) {
  migrateAppointments()
    .then(() => validateMigration())
    .then(() => {
      console.log('\n✨ Migrazione timezone completata!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Errore fatale:', error);
      process.exit(1);
    });
}

module.exports = { migrateAppointments, validateMigration };
