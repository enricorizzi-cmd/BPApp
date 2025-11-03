"use strict";

require('dotenv').config();
const { createClient } = require("@supabase/supabase-js");
const fs = require('fs');
const path = require('path');

// Rotate backups: backup-2 -> backup-3, backup-1 -> backup-2
function rotateBackups(backupDir) {
  const backup3 = path.join(backupDir, 'backup-3.json');
  const backup2 = path.join(backupDir, 'backup-2.json');
  const backup1 = path.join(backupDir, 'backup-1.json');
  
  try {
    // Remove oldest backup (backup-3)
    if (fs.existsSync(backup3)) {
      fs.unlinkSync(backup3);
      console.log("Removed oldest backup (backup-3.json)");
    }
    
    // Move backup-2 to backup-3
    if (fs.existsSync(backup2)) {
      fs.renameSync(backup2, backup3);
      console.log("Rotated backup-2.json -> backup-3.json");
    }
    
    // Move backup-1 to backup-2
    if (fs.existsSync(backup1)) {
      fs.renameSync(backup1, backup2);
      console.log("Rotated backup-1.json -> backup-2.json");
    }
  } catch (error) {
    console.warn("Warning: Could not rotate backups:", error.message);
  }
}

// eslint-disable-next-line complexity
async function createBackup() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://bzvdbmofetujylvgcmqx.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmRibW9mZXR1anlsdmdjbXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MTM1NTAsImV4cCI6MjA3MjM4OTU1MH0.SZEE76n_Lz-8I7CmYkIhArNf41r4PixXRpy-1aRcGU8';
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log("Creating complete backup of Supabase data...");
  
  const backupDir = path.join(__dirname, 'backups');
  
  // Create backup directory
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Rotate existing backups (3 backup rotation)
  rotateBackups(backupDir);
  
  try {
    // Backup kv table (original data)
    console.log("Backing up kv table...");
    const { data: kvData, error: kvError } = await supabase
      .from('kv')
      .select('*');
    
    if (kvError) throw kvError;
    
    // Backup all normalized tables (including missing ones)
    const tables = [
      'users', 'app_users', 'appointments', 'clients', 'periods', 
      'settings', 'push_subscriptions', 'report_recipients', 'gi', 'audit_log', 'open_cycles'
    ];
    
    const backupData = {
      timestamp: new Date().toISOString(),
      supabaseUrl: supabaseUrl,
      tables: {},
      kv: kvData,
      metadata: {
        totalTables: tables.length + 1, // +1 for kv
        kvRecords: kvData.length,
        description: "Daily automated backup with 3-day rotation"
      }
    };
    
    // Backup each table
    for (const table of tables) {
      console.log(`Backing up ${table} table...`);
      const { data, error } = await supabase
        .from(table)
        .select('*');
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist
        throw error;
      }
      
      backupData.tables[table] = data || [];
      console.log(`  Backed up ${(data || []).length} ${table} records`);
    }
    
    // Save complete backup to backup-1.json (most recent)
    const backupFile = path.join(backupDir, 'backup-1.json');
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    
    console.log(`\nBackup completed successfully!`);
    console.log(`Backup location: ${backupFile}`);
    console.log(`Total records backed up: ${Object.values(backupData.tables).reduce((sum, table) => sum + table.length, 0) + kvData.length}`);
    
    return backupFile;
    
  } catch (error) {
    console.error("Backup failed:", error);
    throw error;
  }
}

if (require.main === module) {
  createBackup().catch(console.error);
}

module.exports = { createBackup };
