"use strict";

require('dotenv').config();
const { createClient } = require("@supabase/supabase-js");
const fs = require('fs');
const path = require('path');

async function createBackup() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://bzvdbmofetujylvgcmqx.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmRibW9mZXR1anlsdmdjbXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MTM1NTAsImV4cCI6MjA3MjM4OTU1MH0.SZEE76n_Lz-8I7CmYkIhArNf41r4PixXRpy-1aRcGU8';
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log("Creating complete backup of Supabase data...");
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, 'backups', `backup-${timestamp}`);
  
  // Create backup directory
  if (!fs.existsSync(path.join(__dirname, 'backups'))) {
    fs.mkdirSync(path.join(__dirname, 'backups'));
  }
  fs.mkdirSync(backupDir);
  
  try {
    // Backup kv table (original data)
    console.log("Backing up kv table...");
    const { data: kvData, error: kvError } = await supabase
      .from('kv')
      .select('*');
    
    if (kvError) throw kvError;
    
    fs.writeFileSync(
      path.join(backupDir, 'kv-table.json'),
      JSON.stringify(kvData, null, 2)
    );
    console.log(`  Backed up ${kvData.length} kv records`);
    
    // Backup all normalized tables
    const tables = ['users', 'appointments', 'clients', 'periods', 'settings', 'push_subscriptions', 'gi', 'audit_log'];
    
    for (const table of tables) {
      console.log(`Backing up ${table} table...`);
      const { data, error } = await supabase
        .from(table)
        .select('*');
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist
        throw error;
      }
      
      fs.writeFileSync(
        path.join(backupDir, `${table}.json`),
        JSON.stringify(data || [], null, 2)
      );
      console.log(`  Backed up ${(data || []).length} ${table} records`);
    }
    
    // Create backup info file
    const backupInfo = {
      timestamp: new Date().toISOString(),
      supabaseUrl: supabaseUrl,
      tables: tables,
      kvRecords: kvData.length,
      description: "Complete backup before migration to normalized tables"
    };
    
    fs.writeFileSync(
      path.join(backupDir, 'backup-info.json'),
      JSON.stringify(backupInfo, null, 2)
    );
    
    console.log(`\nBackup completed successfully!`);
    console.log(`Backup location: ${backupDir}`);
    console.log(`Backup info:`, backupInfo);
    
    return backupDir;
    
  } catch (error) {
    console.error("Backup failed:", error);
    throw error;
  }
}

if (require.main === module) {
  createBackup().catch(console.error);
}

module.exports = { createBackup };
