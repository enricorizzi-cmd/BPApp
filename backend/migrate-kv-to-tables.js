"use strict";

require('dotenv').config();
const { createClient } = require("@supabase/supabase-js");

async function migrateData() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://bzvdbmofetujylvgcmqx.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dmRibW9mZXR1anlsdmdjbXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MTM1NTAsImV4cCI6MjA3MjM4OTU1MH0.SZEE76n_Lz-8I7CmYkIhArNf41r4PixXRpy-1aRcGU8';
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log("Starting data migration from kv table to normalized tables...");
  
  try {
    // Get all data from kv table
    const { data: kvData, error: kvError } = await supabase
      .from('kv')
      .select('*');
    
    if (kvError) throw kvError;
    
    console.log(`Found ${kvData.length} records in kv table`);
    
    // Process each kv record
    for (const kv of kvData) {
      const { name, data } = kv;
      const jsonData = JSON.parse(data);
      
      console.log(`Processing ${name}...`);
      
      switch (name) {
        case 'users.json':
          if (jsonData.users && jsonData.users.length > 0) {
            console.log(`  Migrating ${jsonData.users.length} users`);
            // Map column names to match database schema
            const mappedUsers = jsonData.users.map(user => ({
              id: user.id,
              name: user.name,
              email: user.email,
              pass: user.pass,
              role: user.role,
              grade: user.grade,
              permissions: user.permissions,
              resettoken: user.resetToken,
              resettokenexp: user.resetTokenExp,
              createdat: user.createdAt || new Date().toISOString()
            }));
            const { error } = await supabase.from('app_users').insert(mappedUsers);
            if (error) {
              console.error(`  Error migrating users:`, error);
            } else {
              console.log(`  Successfully migrated ${jsonData.users.length} users`);
            }
          }
          break;
          
        case 'appointments.json':
          if (jsonData.appointments && jsonData.appointments.length > 0) {
            console.log(`  Migrating ${jsonData.appointments.length} appointments`);
            // Map start/end to start_time/end_time and fix column names
            const mappedAppointments = jsonData.appointments.map(apt => ({
              id: apt.id,
              client: apt.client,
              start_time: apt.start,
              end_time: apt.end,
              durationminutes: apt.durationMinutes,
              type: apt.type,
              vss: apt.vss,
              vsdpersonal: apt.vsdPersonal,
              vsdindiretto: apt.vsdIndiretto,
              nncf: apt.nncf,
              telefonate: apt.telefonate,
              appfissati: apt.appFissati,
              annotation: apt.notes || apt.annotation,
              userid: apt.userId,
              createdat: apt.createdAt,
              updatedat: apt.updatedAt
            }));
            const { error } = await supabase.from('appointments').insert(mappedAppointments);
            if (error) {
              console.error(`  Error migrating appointments:`, error);
            } else {
              console.log(`  Successfully migrated ${jsonData.appointments.length} appointments`);
            }
          }
          break;
          
        case 'clients.json':
          if (jsonData.clients && jsonData.clients.length > 0) {
            console.log(`  Migrating ${jsonData.clients.length} clients`);
            // Map column names to match database schema
            const mappedClients = jsonData.clients.map(client => ({
              id: client.id,
              name: client.name,
              status: client.status,
              consultantid: client.consultantId,
              consultantname: client.consultantName,
              createdat: client.createdAt || new Date().toISOString(),
              updatedat: client.updatedAt || new Date().toISOString()
            }));
            const { error } = await supabase.from('clients').insert(mappedClients);
            if (error) {
              console.error(`  Error migrating clients:`, error);
            } else {
              console.log(`  Successfully migrated ${jsonData.clients.length} clients`);
            }
          }
          break;
          
        case 'periods.json':
          if (jsonData.periods && jsonData.periods.length > 0) {
            console.log(`  Migrating ${jsonData.periods.length} periods`);
            // Map column names to match database schema
            const mappedPeriods = jsonData.periods.map(period => ({
              id: period.id,
              userid: period.userId,
              type: period.type,
              year: period.year || null,
              week: period.week || null,
              month: period.month || null,
              quarter: period.quarter || null,
              semester: period.semester || null,
              indicatorsprev: period.indicatorsPrev,
              indicatorscons: period.indicatorsCons,
              createdat: period.createdAt || new Date().toISOString(),
              updatedat: period.updatedAt || new Date().toISOString(),
              enddate: period.endDate,
              startdate: period.startDate
            }));
            const { error } = await supabase.from('periods').insert(mappedPeriods);
            if (error) {
              console.error(`  Error migrating periods:`, error);
            } else {
              console.log(`  Successfully migrated ${jsonData.periods.length} periods`);
            }
          }
          break;
          
        case 'settings.json':
          console.log(`  Migrating settings`);
          const { error: settingsError } = await supabase.from('settings').insert({
            id: 'main',
            data: jsonData,
            version: parseInt(jsonData.version) || 1,
            updatedat: new Date().toISOString()
          });
          if (settingsError) {
            console.error(`  Error migrating settings:`, settingsError);
          } else {
            console.log(`  Successfully migrated settings`);
          }
          break;
          
        case 'push_subscriptions.json':
          if (jsonData.subs && jsonData.subs.length > 0) {
            console.log(`  Migrating ${jsonData.subs.length} push subscriptions`);
            // Map subs to push_subscriptions format
            const mappedSubs = jsonData.subs.map((sub, index) => ({
              id: sub.id || `${sub.userId}_${Date.now()}_${index}`,
              userid: sub.userId,
              endpoint: sub.endpoint,
              p256dh: sub.keys?.p256dh,
              auth: sub.keys?.auth,
              createdat: sub.createdAt || new Date().toISOString(),
              lastseen: sub.lastSeen || new Date().toISOString()
            }));
            const { error: subsError } = await supabase.from('push_subscriptions').insert(mappedSubs);
            if (subsError) {
              console.error(`  Error migrating push subscriptions:`, subsError);
            } else {
              console.log(`  Successfully migrated ${jsonData.subs.length} push subscriptions`);
            }
          }
          break;
          
        case 'gi.json':
          if (jsonData.sales && jsonData.sales.length > 0) {
            console.log(`  Migrating ${jsonData.sales.length} gi records`);
            // Map column names to match database schema
            const mappedGi = jsonData.sales.map(gi => ({
              id: gi.id,
              data: gi.data,
              createdat: gi.createdAt || new Date().toISOString(),
              updatedat: gi.updatedAt || new Date().toISOString(),
              appointmentid: gi.appointmentId,
              clientname: gi.clientName,
              date: gi.date,
              consultantid: gi.consultantId,
              consultantname: gi.consultantName,
              services: gi.services,
              vsstotal: gi.vssTotal,
              schedule: gi.schedule
            }));
            const { error: giError } = await supabase.from('gi').insert(mappedGi);
            if (giError) {
              console.error(`  Error migrating gi records:`, giError);
            } else {
              console.log(`  Successfully migrated ${jsonData.sales.length} gi records`);
            }
          }
          break;
          
        default:
          console.log(`  Skipping unknown table: ${name}`);
      }
    }
    
    console.log("Migration completed successfully!");
    
    // Verify migration
    console.log("\nVerifying migration...");
    const { data: users } = await supabase.from('users').select('count');
    const { data: appointments } = await supabase.from('appointments').select('count');
    const { data: clients } = await supabase.from('clients').select('count');
    const { data: periods } = await supabase.from('periods').select('count');
    
    console.log(`Users: ${users?.length || 0}`);
    console.log(`Appointments: ${appointments?.length || 0}`);
    console.log(`Clients: ${clients?.length || 0}`);
    console.log(`Periods: ${periods?.length || 0}`);
    
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

if (require.main === module) {
  migrateData().catch(console.error);
}

module.exports = { migrateData };
