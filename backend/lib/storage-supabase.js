"use strict";

const { createClient } = require("@supabase/supabase-js");
const logger = require("./logger");

let supabase = null;

async function init() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY for Supabase storage");
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  
  // Test connection
  try {
    const { data, error } = await supabase.from('appointments').select('count').limit(1);
    if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist yet
      throw error;
    }
    logger.info("Supabase connection established");
  } catch (err) {
    logger.error("Supabase connection failed:", err);
    throw err;
  }
}

async function readJSON(tableName) {
  if (!supabase) throw new Error("Supabase not initialized");
  
  try {
    // Handle different table structures
          if (tableName === 'users.json') {
            const { data, error } = await supabase.from('app_users').select('*');
            if (error) throw error;
            // Map column names back to application format
            const mappedUsers = (data || []).map(user => ({
              ...user,
              resetToken: user.resettoken,
              resetTokenExp: user.resettokenexp,
              createdAt: user.createdat
            }));
            return { users: mappedUsers };
          }
    
    if (tableName === 'appointments.json') {
      const { data, error } = await supabase.from('appointments').select('*');
      if (error) throw error;
      // Map 'start_time' and 'end_time' back to 'start' and 'end'
      const mappedAppointments = (data || []).map(apt => ({
        ...apt,
        start: apt.start_time,
        end: apt.end_time,
        start_time: undefined,
        end_time: undefined
      }));
      return { appointments: mappedAppointments };
    }
    
          if (tableName === 'clients.json') {
            const { data, error } = await supabase.from('clients').select('*');
            if (error) throw error;
            // Map column names back to application format
            const mappedClients = (data || []).map(client => ({
              ...client,
              consultantId: client.consultantid,
              consultantName: client.consultantname,
              createdAt: client.createdat,
              updatedAt: client.updatedat
            }));
            return { clients: mappedClients };
          }
    
    if (tableName === 'periods.json') {
      const { data, error } = await supabase.from('periods').select('*');
      if (error) throw error;
      // Map column names back to application format
      const mappedPeriods = (data || []).map(period => ({
        ...period,
        userId: period.userid,
        indicatorsPrev: period.indicatorsprev,
        indicatorsCons: period.indicatorscons,
        createdAt: period.createdat,
        updatedAt: period.updatedat,
        endDate: period.enddate,
        startDate: period.startdate
      }));
      return { periods: mappedPeriods };
    }
    
    if (tableName === 'settings.json') {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 'main').single();
      if (error && error.code !== 'PGRST116') throw error;
      return data?.data || { version: 13 };
    }
    
    if (tableName === 'push_subscriptions.json') {
      const { data, error } = await supabase.from('push_subscriptions').select('*');
      if (error) throw error;
      // Map column names back to application format
      const mappedSubs = (data || []).map(sub => ({
        ...sub,
        userId: sub.userid,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        },
        createdAt: sub.createdat,
        lastSeen: sub.lastseen
      }));
      return { subs: mappedSubs };
    }
    
    if (tableName === 'report_recipients.json') {
      const { data, error } = await supabase.from('report_recipients').select('*');
      if (error) throw error;
      return { recipients: data || [] };
    }
    
    if (tableName === 'gi.json') {
      const { data, error } = await supabase.from('gi').select('*');
      if (error) throw error;
      return { gi: data || [] };
    }
    
    if (tableName === 'audit.log') {
      const { data, error } = await supabase.from('audit_log').select('*');
      if (error) throw error;
      return { logs: data || [] };
    }
    
    // Default case - return empty array
    return [];
  } catch (err) {
    logger.error(`Error reading ${tableName}:`, err);
    throw err;
  }
}

async function writeJSON(tableName, data) {
  if (!supabase) throw new Error("Supabase not initialized");
  
  try {
    // Handle different table structures
    if (tableName === 'users.json') {
      const users = data.users || [];
      await supabase.from('app_users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (users.length > 0) {
        // Map column names to database format
        const mappedUsers = users.map(user => ({
          ...user,
          resettoken: user.resetToken,
          resettokenexp: user.resetTokenExp,
          createdat: user.createdAt || new Date().toISOString()
        }));
        await supabase.from('app_users').insert(mappedUsers);
      }
      logger.info(`Successfully wrote ${users.length} users`);
      return;
    }
    
    if (tableName === 'appointments.json') {
      const appointments = data.appointments || [];
      await supabase.from('appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (appointments.length > 0) {
        // Map 'start' and 'end' to 'start_time' and 'end_time'
        const mappedAppointments = appointments.map(apt => ({
          ...apt,
          start_time: apt.start,
          end_time: apt.end,
          start: undefined,
          end: undefined
        }));
        await supabase.from('appointments').insert(mappedAppointments);
      }
      logger.info(`Successfully wrote ${appointments.length} appointments`);
      return;
    }
    
    if (tableName === 'clients.json') {
      const clients = data.clients || [];
      await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (clients.length > 0) {
        // Map column names to database format
        const mappedClients = clients.map(client => ({
          ...client,
          consultantid: client.consultantId,
          consultantname: client.consultantName,
          createdat: client.createdAt || new Date().toISOString(),
          updatedat: client.updatedAt || new Date().toISOString()
        }));
        await supabase.from('clients').insert(mappedClients);
      }
      logger.info(`Successfully wrote ${clients.length} clients`);
      return;
    }
    
    if (tableName === 'periods.json') {
      const periods = data.periods || [];
      await supabase.from('periods').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (periods.length > 0) {
        // Map column names to database format
        const mappedPeriods = periods.map(period => ({
          ...period,
          userid: period.userId,
          indicatorsprev: period.indicatorsPrev,
          indicatorscons: period.indicatorsCons,
          createdat: period.createdAt || new Date().toISOString(),
          updatedat: period.updatedAt || new Date().toISOString(),
          enddate: period.endDate,
          startdate: period.startDate
        }));
        await supabase.from('periods').insert(mappedPeriods);
      }
      logger.info(`Successfully wrote ${periods.length} periods`);
      return;
    }
    
    if (tableName === 'settings.json') {
      await supabase.from('settings').upsert({
        id: 'main',
        data: data,
        updatedAt: new Date().toISOString()
      });
      logger.info(`Successfully wrote settings`);
      return;
    }
    
    if (tableName === 'push_subscriptions.json') {
      const subs = data.subs || [];
      await supabase.from('push_subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (subs.length > 0) {
        // Map column names to database format
        const mappedSubs = subs.map(sub => ({
          ...sub,
          userid: sub.userId,
          p256dh: sub.keys?.p256dh,
          auth: sub.keys?.auth,
          createdat: sub.createdAt || new Date().toISOString(),
          lastseen: sub.lastSeen || new Date().toISOString()
        }));
        await supabase.from('push_subscriptions').insert(mappedSubs);
      }
      logger.info(`Successfully wrote ${subs.length} push subscriptions`);
      return;
    }
    
    if (tableName === 'report_recipients.json') {
      const recipients = data.recipients || [];
      await supabase.from('report_recipients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (recipients.length > 0) {
        await supabase.from('report_recipients').insert(recipients);
      }
      logger.info(`Successfully wrote ${recipients.length} recipients`);
      return;
    }
    
    if (tableName === 'gi.json') {
      const gi = data.gi || [];
      await supabase.from('gi').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (gi.length > 0) {
        await supabase.from('gi').insert(gi);
      }
      logger.info(`Successfully wrote ${gi.length} gi records`);
      return;
    }
    
    if (tableName === 'audit.log') {
      const logs = data.logs || [];
      await supabase.from('audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (logs.length > 0) {
        await supabase.from('audit_log').insert(logs);
      }
      logger.info(`Successfully wrote ${logs.length} audit logs`);
      return;
    }
    
    // Default case - treat as array
    if (Array.isArray(data)) {
      await supabase.from(tableName.replace('.json', '')).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (data.length > 0) {
        await supabase.from(tableName.replace('.json', '')).insert(data);
      }
      logger.info(`Successfully wrote ${data.length} records to ${tableName}`);
    }
  } catch (err) {
    logger.error(`Error writing ${tableName}:`, err);
    throw err;
  }
}

async function insertRecord(tableName, record) {
  if (!supabase) throw new Error("Supabase not initialized");
  
  try {
    const { data, error } = await supabase
      .from(tableName)
      .insert(record)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (err) {
    logger.error(`Error inserting record into ${tableName}:`, err);
    throw err;
  }
}

async function updateRecord(tableName, id, updates) {
  if (!supabase) throw new Error("Supabase not initialized");
  
  try {
    const { data, error } = await supabase
      .from(tableName)
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (err) {
    logger.error(`Error updating record in ${tableName}:`, err);
    throw err;
  }
}

async function deleteRecord(tableName, id) {
  if (!supabase) throw new Error("Supabase not initialized");
  
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  } catch (err) {
    logger.error(`Error deleting record from ${tableName}:`, err);
    throw err;
  }
}

module.exports = {
  init,
  readJSON,
  writeJSON,
  insertRecord,
  updateRecord,
  deleteRecord
};
