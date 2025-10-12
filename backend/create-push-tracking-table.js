#!/usr/bin/env node

/* BPApp - Crea tabella push_notifications_sent
   Script per creare la tabella push_notifications_sent in Supabase
*/

const fs = require('fs');
const path = require('path');

// Carica le variabili d'ambiente
require('dotenv').config();

// Importa il sistema di storage esistente
const storage = require('./lib/storage-supabase');
const { init: initStore, supabase } = storage;

async function createPushTrackingTable() {
  console.log('🚀 Creating push_notifications_sent table...');
  
  try {
    // Inizializza il sistema di storage
    await initStore();
    
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }
    
    // Leggi il file SQL di migrazione
    const sqlPath = path.join(__dirname, 'migrations', 'create-push-tracking.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📋 Executing SQL migration...');
    
    // Esegui la migrazione usando la funzione SQL diretta
    try {
      const { data, error } = await supabase.rpc('exec', { sql });
      
      if (error) {
        console.error('❌ Migration failed:', error);
        
        // Prova con un approccio alternativo - crea la tabella manualmente
        console.log('🔄 Trying alternative approach...');
        
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS push_notifications_sent (
            id TEXT PRIMARY KEY,
            userid TEXT NOT NULL,
            appointmentid TEXT NOT NULL,
            notification_type TEXT NOT NULL,
            sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `;
        
        const { error: createError } = await supabase.rpc('exec', { sql: createTableSQL });
        
        if (createError) {
          console.error('❌ Alternative approach also failed:', createError);
          throw createError;
        }
        
        console.log('✅ Table created with alternative approach');
      } else {
        console.log('✅ Migration completed successfully');
      }
    } catch (error) {
      console.error('❌ SQL execution failed:', error);
      
      // Prova con insertRecord per creare la tabella
      console.log('🔄 Trying insertRecord approach...');
      
      try {
        // Prova a inserire un record di test per creare la tabella
        await supabase.from('push_notifications_sent').insert({
          id: 'test_' + Date.now(),
          userid: 'test',
          appointmentid: 'test',
          notification_type: 'test',
          sent_at: new Date().toISOString(),
          createdat: new Date().toISOString()
        });
        
        // Se arriva qui, la tabella esiste già
        console.log('✅ Table already exists');
        
        // Rimuovi il record di test
        await supabase.from('push_notifications_sent').delete().eq('id', 'test_' + Date.now());
        
      } catch (insertError) {
        console.error('❌ Table creation failed:', insertError);
        throw insertError;
      }
    }
    
    // Verifica che la tabella sia stata creata
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'push_notifications_sent');
    
    if (tablesError) {
      console.warn('⚠️  Could not verify table creation:', tablesError);
    } else if (tables && tables.length > 0) {
      console.log('✅ Table push_notifications_sent verified');
    } else {
      console.warn('⚠️  Table push_notifications_sent not found');
    }
    
    console.log('🎉 Push tracking table setup completed!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Esegui la creazione se chiamato direttamente
if (require.main === module) {
  createPushTrackingTable().catch(console.error);
}

module.exports = { createPushTrackingTable };
