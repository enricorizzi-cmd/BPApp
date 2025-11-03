#!/usr/bin/env node

/* BPApp - Migrazione User Preferences
   Crea la tabella user_preferences per sincronizzazione cross-device
*/

const fs = require('fs');
const path = require('path');

// Carica le variabili d'ambiente
require('dotenv').config();

// Importa il sistema di storage esistente
const storage = require('./lib/storage-supabase');
const { init: initStore, supabase } = storage;

// eslint-disable-next-line complexity
async function createUserPreferencesTable() {
  console.log('🚀 Starting user preferences migration...');
  
  try {
    // Inizializza il sistema di storage
    await initStore();
    
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }
    
    console.log('📋 Creating user_preferences table...');
    
    // Leggi il file SQL di migrazione
    const sqlPath = path.join(__dirname, 'migrations', 'create-user-preferences.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Esegui la migrazione usando la funzione SQL diretta
    const { data, error } = await supabase.rpc('exec', { sql });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      
      // Prova con un approccio alternativo - crea la tabella manualmente
      console.log('🔄 Trying alternative approach...');
      
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS user_preferences (
          id TEXT PRIMARY KEY,
          userid TEXT NOT NULL,
          preferences JSONB NOT NULL DEFAULT '{}',
          createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
    
    // Verifica che la tabella sia stata creata
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'user_preferences');
    
    if (tablesError) {
      console.warn('⚠️  Could not verify table creation:', tablesError);
    } else if (tables && tables.length > 0) {
      console.log('✅ Table user_preferences verified');
    } else {
      console.warn('⚠️  Table user_preferences not found');
    }
    
    // Inserisci preferenze di default per utenti esistenti
    console.log('👥 Creating default preferences for existing users...');
    
    const { data: users, error: usersError } = await supabase
      .from('app_users')
      .select('id, name, role, grade');
    
    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }
    
    console.log(`📊 Found ${users.length} users`);
    
    for (const user of users) {
      const defaultPreferences = {
        profile: {
          name: user.name,
          role: user.role,
          grade: user.grade
        },
        ui: {
          sidebarCollapsed: false,
          defaultPeriod: 'mensile',
          theme: 'auto'
        },
        notifications: {
          enabled: true,
          pushEnabled: true,
          emailEnabled: true
        },
        work: {
          timezone: 'Europe/Rome',
          workingHours: {
            start: '09:00',
            end: '18:00'
          }
        }
      };
      
      const { error: insertError } = await supabase
        .from('user_preferences')
        .upsert({
          id: `pref_${user.id}`,
          userid: user.id,
          preferences: defaultPreferences,
          createdat: new Date().toISOString(),
          updatedat: new Date().toISOString()
        });
      
      if (insertError) {
        console.warn(`⚠️  Could not create preferences for user ${user.name}:`, insertError);
      } else {
        console.log(`✅ Created preferences for ${user.name}`);
      }
    }
    
    console.log('🎉 Migration completed successfully!');
    console.log('📋 User preferences are now synchronized across all devices');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Esegui la migrazione se chiamato direttamente
if (require.main === module) {
  createUserPreferencesTable().catch(console.error);
}

module.exports = { createUserPreferencesTable };
