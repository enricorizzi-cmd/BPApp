const express = require('express');
const { parseDateTime, toUTCString, minutesBetween, addMinutes, isValidDateTime } = require('../lib/timezone');
const productionLogger = require('../lib/production-logger');

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, computeEndLocal, findOrCreateClientByName, genId, supabase }){
  const router = express.Router();

  // ---- helpers ----
  function parseDateSmart(s){
    return parseDateTime(s);
  }
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const toStr = (v) => String(v);
  const toType = (v) => String(v || 'manuale');
  const toNum = (v) => Number(v || 0);
  const toBool = (v) => !!v;
  const orEmpty = (v) => v || '';

  function copyIfPresent(target, src, key, transform) {
    if (has(src, key)) target[key] = transform ? transform(src[key]) : src[key];
  }

  function deriveOldDuration(it, startOld, endOld) {
    const raw = Number(it.durationMinutes);
    if (isFinite(raw) && raw > 0) return raw;
    if (isNaN(startOld) || isNaN(endOld)) return 90;
    return minutesBetween(startOld, endOld);
  }

  function computeNewTiming(body, startOld, durOld) {
    const startNew = has(body, 'start') ? parseDateSmart(body.start) : startOld;
    const endProvided = has(body, 'end');
    const endCandidate = endProvided ? parseDateSmart(body.end) : null;
    const durProvided = has(body, 'durationMinutes');
    let minutes = durProvided ? Number(body.durationMinutes) : durOld;
    if (!isFinite(minutes) || minutes <= 0) minutes = durOld;

    let endNew;
    if (endProvided && !isNaN(endCandidate)) {
      endNew = endCandidate;
      minutes = minutesBetween(startNew, endNew);
    } else if (durProvided && isFinite(minutes) && minutes > 0) {
      endNew = addMinutes(startNew, minutes);
    } else {
      // keep same duration relative to new start
      endNew = addMinutes(startNew, durOld > 0 ? durOld : 90);
      minutes = minutesBetween(startNew, endNew);
    }
    return { startNew, endNew, minutes };
  }
  function defaultMinutesForType(t){
    const s = String(t||'').toLowerCase();
    if (s.includes('mezza')) return 240;
    if (s.includes('giorn')) return 570;
    if (s.includes('formaz')) return 570;
    if (s.includes('mbs')) return 570;
    if (s.includes('sottoprod')) return 240;
    if (s.includes('riunione')) return 60;
    if (s.includes('impegni personali')) return 60;
    if (s.includes('vend'))  return 90;
    return 90; // fallback
  }
  async function resolveClientIdByName(clientsDb, name){
    const key = String(name||'').toLowerCase();
    const c = (clientsDb.clients||[]).find(x => (x.name||'').toLowerCase() === key);
    return c ? c.id : null;
  }

  async function handleGetById(req, res, db, clientsDb, isAdmin){
    const a = (db.appointments||[]).find(x => x.id === req.query.id);
    if(!a) return res.status(404).json({ error:'not found' });
    if(!isAdmin && a.userId !== req.user.id) return res.status(403).json({ error:'forbidden' });
    const clientId = a.clientId || await resolveClientIdByName(clientsDb, a.client);
    return res.json({ appointment: { ...a, clientId } });
  }

  async function handleGetLast(req, res, db, clientsDb){
    const mine = (db.appointments||[]).filter(a => a.userId === req.user.id);
    const last = mine.sort((a,b)=> String(b.start||'').localeCompare(String(a.start||'')))[0] || null;
    if(!last) return res.json({ appointment: null });
    const clientId = last.clientId || await resolveClientIdByName(clientsDb, last.client);
    return res.json({ appointment: { ...last, clientId } });
  }

  async function handleGetList(req, res, db, clientsDb, isAdmin){
    const global = req.query.global === '1';
    const userId = req.query.user;
    const fromDate = req.query.from;
    const toDate = req.query.to;
    
    try {
      // Prova prima Supabase per dati aggiornati
      if (typeof supabase !== 'undefined' && supabase) {
        let query = supabase
          .from('appointments')
          .select('*')
          .order('start_time', { ascending: false });
        
        // Filtri per utente
        if (global && isAdmin) {
          // Admin globale - tutti gli appuntamenti
        } else if (isAdmin && userId) {
          // Admin che filtra per utente specifico
          query = query.eq('userid', userId);
        } else {
          // Utente normale - solo i propri appuntamenti
          query = query.eq('userid', req.user.id);
        }
        
        // Filtro periodo (from/to) se specificato
        if (fromDate) {
          query = query.gte('start_time', fromDate + 'T00:00:00.000Z');
        }
        if (toDate) {
          // Aggiungi 23:59:59.999 alla data di fine per includere tutto il giorno
          query = query.lte('start_time', toDate + 'T23:59:59.999Z');
        }
        
        const { data, error } = await query;
        
        if (error) {
          productionLogger.error('Supabase error in handleGetList:', error);
          throw error;
        }
        
        // Mappa i dati da Supabase al formato frontend
        const appointments = (data || []).map(row => ({
          id: row.id,
          userId: row.userid,
          client: row.client,
          clientId: row.clientid,
          type: row.type,
          start: row.start_time,
          end: row.end_time,
          durationMinutes: row.durationminutes,
          vss: row.vss,
          vsdPersonal: row.vsdpersonal,
          vsdIndiretto: row.vsdindiretto,
          telefonate: row.telefonate,
          appFissati: row.appfissati,
          nncf: !!row.nncf, // ← CORRETTO: conversione esplicita a boolean
          nncfPromptAnswered: !!row.nncfpromptanswered, // ← CORRETTO: conversione esplicita a boolean
          salePromptAnswered: !!row.salepromptanswered, // ← CORRETTO: conversione esplicita a boolean
          salePromptSnoozedUntil: row.salepromptsnoozeduntil,
          nncfPromptSnoozedUntil: row.nncfpromptsnoozeduntil,
          notes: row.notes,
          createdAt: row.createdat,
          updatedAt: row.updatedat
        }));
        
        // Arricchisci gli appuntamenti con il nome del consulente
        const usersDb = await readJSON("users.json");
        const enriched = appointments.map(a => {
          const user = (usersDb.users || []).find(u => String(u.id) === String(a.userId));
          return { 
            ...a, 
            clientId: a.clientId || (resolveClientIdByName(clientsDb, a.client)),
            consultantName: user ? (user.name || user.email || `User ${a.userId}`) : `User ${a.userId}`
          };
        });
        
        // DEBUG: Log per verificare lettura corretta da Supabase
        productionLogger.debug(`[APPOINTMENTS_DEBUG] Supabase query successful: ${enriched.length} appointments`);
        if (enriched.length > 0) {
          const sample = enriched[0];
          productionLogger.debug(`[APPOINTMENTS_DEBUG] Sample appointment: ${sample.id}, nncf: ${sample.nncf}, nncfPromptAnswered: ${sample.nncfPromptAnswered}, userId: ${sample.userId}, consultantName: ${sample.consultantName}`);
        }
        
        return res.json({ appointments: enriched });
      }
    } catch (error) {
      productionLogger.error('Error fetching from Supabase, falling back to JSON:', error);
    }
    
    // Fallback al metodo tradizionale
    const all = db.appointments||[];
    let list;
    if(global && isAdmin) list = all;
    else if(isAdmin && userId) list = all.filter(a => a.userId === userId);
    else list = all.filter(a => a.userId === req.user.id);
    
    // Filtro periodo (from/to) se specificato
    if (fromDate || toDate) {
      const fs = fromDate ? new Date(fromDate).getTime() : -Infinity;
      const te = toDate ? new Date(toDate + 'T23:59:59.999Z').getTime() : +Infinity;
      list = list.filter(a => {
        const appDate = a.start ? new Date(a.start).getTime() : 0;
        return appDate >= fs && appDate <= te;
      });
    }
    
    // Arricchisci anche il fallback JSON con il nome del consulente
    const usersDb = await readJSON("users.json");
    const enriched = (list||[]).map(a => {
      const user = (usersDb.users || []).find(u => String(u.id) === String(a.userId));
      return { 
        ...a, 
        clientId: a.clientId || (resolveClientIdByName(clientsDb, a.client)),
        nncf: !!a.nncf,
        nncfPromptAnswered: !!a.nncfPromptAnswered,
        salePromptAnswered: !!a.salePromptAnswered,
        consultantName: user ? (user.name || user.email || `User ${a.userId}`) : `User ${a.userId}`
      };
    });
    
    // DEBUG: Log per verificare fallback JSON
    productionLogger.debug(`[APPOINTMENTS_DEBUG] JSON fallback: ${enriched.length} appointments`);
    if (enriched.length > 0) {
      const sample = enriched[0];
      productionLogger.debug(`[APPOINTMENTS_DEBUG] Sample appointment (JSON): ${sample.id}, nncf: ${sample.nncf}, nncfPromptAnswered: ${sample.nncfPromptAnswered}, userId: ${sample.userId}, consultantName: ${sample.consultantName}`);
    }
    
    return res.json({ appointments: enriched });
  }

  async function handleUpdate(req, res, body){
    // L'appuntamento è già stato verificato nel router principale
    // Recupera l'appuntamento completo da Supabase
    try {
      const { data: existingAppointment, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', body.id)
        .single();
      
      if (error || !existingAppointment) {
        return res.status(404).json({ error:'appointment not found' });
      }
      
      const it = {
        id: existingAppointment.id,
        userId: existingAppointment.userid,
        client: existingAppointment.client,
        clientId: existingAppointment.clientid,
        type: existingAppointment.type,
        start: existingAppointment.start_time,
        end: existingAppointment.end_time,
        durationMinutes: existingAppointment.durationminutes,
        vss: existingAppointment.vss,
        vsdPersonal: existingAppointment.vsdpersonal,
        vsdIndiretto: existingAppointment.vsdindiretto,
        telefonate: existingAppointment.telefonate,
        appFissati: existingAppointment.appfissati,
        nncf: existingAppointment.nncf,
        nncfPromptAnswered: existingAppointment.nncfpromptanswered,
        salePromptAnswered: existingAppointment.salepromptanswered,
        salePromptSnoozedUntil: existingAppointment.salepromptsnoozeduntil,
        nncfPromptSnoozedUntil: existingAppointment.nncfpromptsnoozeduntil,
        notes: existingAppointment.notes,
        createdAt: existingAppointment.createdat,
        updatedAt: existingAppointment.updatedat
      };

    // Base fields
    copyIfPresent(it, body, 'client', toStr);
    copyIfPresent(it, body, 'type', toType);
    copyIfPresent(it, body, 'vss', toNum);
    copyIfPresent(it, body, 'vsdPersonal', toNum);
    copyIfPresent(it, body, 'vsdIndiretto', toNum);
    copyIfPresent(it, body, 'telefonate', toNum);
    copyIfPresent(it, body, 'appFissati', toNum);
    copyIfPresent(it, body, 'nncf', toBool);
    // Hidden/persisted flags
    copyIfPresent(it, body, 'nncfPromptAnswered', toBool);
    copyIfPresent(it, body, 'salePromptAnswered', toBool);
    copyIfPresent(it, body, 'salePromptSnoozedUntil', orEmpty);
    copyIfPresent(it, body, 'nncfPromptSnoozedUntil', orEmpty);
    copyIfPresent(it, body, 'notes', orEmpty);

    const startOld = parseDateSmart(it.start);
    const endOld   = parseDateSmart(it.end);
    const durOld   = deriveOldDuration(it, startOld, endOld);
    const { startNew, endNew, minutes } = computeNewTiming(body, startOld, durOld);

    it.start = startNew.toISOString();
    it.end   = endNew.toISOString();
    it.durationMinutes = minutes;

    const c = await findOrCreateClientByName(it.client, it.nncf, { id:req.user.id, name:(req.user.name||'') });
    it.clientId = c.id;
    if(!it.createdAt) it.createdAt = new Date().toISOString();
    it.updatedAt = new Date().toISOString();

    // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof updateRecord === 'function') {
      try {
        // Supabase: aggiornamento solo dei campi modificati
        const mappedUpdates = {
          updatedat: it.updatedAt
        };
        
        // Aggiorna solo i campi presenti nel body della richiesta
        if (body.client !== undefined) mappedUpdates.client = it.client;
        if (body.start !== undefined) mappedUpdates.start_time = it.start;
        if (body.end !== undefined) mappedUpdates.end_time = it.end;
        if (body.durationMinutes !== undefined) mappedUpdates.durationminutes = it.durationMinutes;
        if (body.type !== undefined) mappedUpdates.type = it.type;
        if (body.vss !== undefined) mappedUpdates.vss = it.vss;
        if (body.vsdPersonal !== undefined) mappedUpdates.vsdpersonal = it.vsdPersonal;
        if (body.vsdIndiretto !== undefined) mappedUpdates.vsdindiretto = it.vsdIndiretto;
        if (body.telefonate !== undefined) mappedUpdates.telefonate = it.telefonate;
        if (body.appFissati !== undefined) mappedUpdates.appfissati = it.appFissati;
        if (body.nncf !== undefined) mappedUpdates.nncf = it.nncf;
        if (body.nncfPromptAnswered !== undefined) {
          mappedUpdates.nncfpromptanswered = !!body.nncfPromptAnswered;
          productionLogger.debug(`[DEBUG_BANNER_SAVE] Setting nncfpromptanswered: ${body.nncfPromptAnswered} -> ${mappedUpdates.nncfpromptanswered}`);
        }
        if (body.salePromptAnswered !== undefined) {
          mappedUpdates.salepromptanswered = !!body.salePromptAnswered;
          productionLogger.debug(`[DEBUG_BANNER_SAVE] Setting salepromptanswered: ${body.salePromptAnswered} -> ${mappedUpdates.salepromptanswered}`);
        }
        if (body.salePromptSnoozedUntil !== undefined) mappedUpdates.salepromptsnoozeduntil = body.salePromptSnoozedUntil;
        if (body.nncfPromptSnoozedUntil !== undefined) mappedUpdates.nncfpromptsnoozeduntil = body.nncfPromptSnoozedUntil;
        if (body.notes !== undefined) {
          mappedUpdates.notes = it.notes;
          mappedUpdates.annotation = it.notes; // Duplicato per compatibilità
        }
        
        // DEBUG: Log banner fields per troubleshooting
        if (body.nncfPromptAnswered !== undefined || body.salePromptAnswered !== undefined) {
          productionLogger.debug(`[DEBUG_BANNER_SAVE] Updating appointment ${it.id} with banner fields`);
          productionLogger.debug(`[DEBUG_BANNER_SAVE] Original values: nncfPromptAnswered: ${body.nncfPromptAnswered}, salePromptAnswered: ${body.salePromptAnswered}`);
          productionLogger.debug(`[DEBUG_BANNER_SAVE] Mapped fields: nncfpromptanswered: ${mappedUpdates.nncfpromptanswered}, salepromptanswered: ${mappedUpdates.salepromptanswered}`);
          productionLogger.debug(`[DEBUG_BANNER_SAVE] All mapped updates:`, JSON.stringify(mappedUpdates, null, 2));
        }
        
        productionLogger.debug(`[DEBUG_BANNER_SAVE] Calling updateRecord for appointment ${it.id}`);
        await updateRecord('appointments', it.id, mappedUpdates);
        productionLogger.debug(`[DEBUG_BANNER_SAVE] Successfully updated appointment ${it.id}`);
        
        // Log dell'operazione per monitoraggio
        productionLogger.debug(`[APPOINTMENT_UPDATED] User: ${req.user.id}, ID: ${it.id}, Client: ${it.client}, Start: ${it.start}`);
        
      } catch (error) {
        productionLogger.error('Error updating appointment:', error);
        return res.status(500).json({ error: 'Failed to update appointment' });
      }
    }
    
      return res.json({ ok:true, id: it.id, clientId: it.clientId });
    } catch (error) {
      productionLogger.error('Error in handleUpdate:', error);
      return res.status(500).json({ error: 'Database error during update' });
    }
  }

  async function handleCreate(req, res, body){
    if(!body.start) return res.status(400).json({ error:'missing fields' });
    if(!body.client){
      const t = String(body.type||'').toLowerCase();
      if(t==='formazione' || t==='mbs' || t==='sottoprodotti' || t==='riunione' || t==='impegni personali'){
        body.client = body.type;
      } else {
        return res.status(400).json({ error:'missing fields' });
      }
    }
    
    const start = parseDateSmart(body.start);
    if(isNaN(start)) return res.status(400).json({ error:'invalid start' });

    let end = null;
    let minutes = Number(body.durationMinutes||0);
    if (body.end){
      const e = parseDateSmart(body.end);
      if(!isNaN(e)){
        end = e;
        minutes = minutesBetween(start, e);
      }
    }
    if(!end){
      if(!isFinite(minutes) || minutes<=0){ minutes = defaultMinutesForType(body.type); }
      end = addMinutes(start, minutes);
    }

    const c = await findOrCreateClientByName(body.client, !!body.nncf, { id:req.user.id, name:(req.user.name||'') });
    const nowIso = new Date().toISOString();
    const row = {
      id: body.id || genId(),
      userId: req.user.id,
      client: String(body.client),
      clientId: c.id,
      type: String(body.type||'manuale'),
      start: toUTCString(start),
      end: toUTCString(end),
      durationMinutes: minutes,
      vss: Number(body.vss||0),
      vsdPersonal: Number(body.vsdPersonal||0),
      vsdIndiretto: Number(body.vsdIndiretto||0),
      telefonate: Number(body.telefonate||0),
      appFissati: Number(body.appFissati||0),
      nncf: !!body.nncf,
      nncfPromptAnswered: !!body.nncfPromptAnswered,
      salePromptAnswered: !!body.salePromptAnswered,
      salePromptSnoozedUntil: body.salePromptSnoozedUntil || null,
      nncfPromptSnoozedUntil: body.nncfPromptSnoozedUntil || null,
      notes: body.notes||'',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    
    // Usa insertRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof insertRecord === 'function') {
      try {
        // Supabase: inserimento singolo con mapping corretto dei campi esistenti
        const mappedRow = {
          id: row.id,
          client: row.client,
          start_time: row.start,
          end_time: row.end,
          durationminutes: row.durationMinutes,
          type: row.type,
          vss: row.vss,
          vsdpersonal: row.vsdPersonal,
          vsdindiretto: row.vsdIndiretto,
          telefonate: row.telefonate,
          appfissati: row.appFissati,
          nncf: row.nncf,
          nncfpromptanswered: row.nncfPromptAnswered,
          salepromptanswered: row.salePromptAnswered,
          salepromptsnoozeduntil: row.salePromptSnoozedUntil,
          nncfpromptsnoozeduntil: row.nncfPromptSnoozedUntil,
          notes: row.notes,
          annotation: row.notes, // Duplicato per compatibilità
          userid: row.userId,
          clientid: row.clientId,
          createdat: row.createdAt,
          updatedat: row.updatedAt
        };
        await insertRecord('appointments', mappedRow);
        
        // Log dell'operazione per monitoraggio
        productionLogger.debug(`[APPOINTMENT_CREATED] User: ${req.user.id}, ID: ${row.id}, Client: ${row.client}, Start: ${row.start}`);
        
      } catch (error) {
        productionLogger.error('Error inserting appointment:', error);
        return res.status(500).json({ error: 'Failed to save appointment' });
      }
    }
    
    return res.json({ ok:true, id: row.id, clientId: row.clientId });
  }

  // ---- routes ----
  router.get('/appointments', auth, async (req,res)=>{
    const db = await readJSON('appointments.json');
    const clientsDb = await readJSON('clients.json');
    const isAdmin = (req.user.role === 'admin');

    if (req.query.id) return handleGetById(req, res, db, clientsDb, isAdmin);
    if (req.query.last === '1') return handleGetLast(req, res, db, clientsDb);
    return handleGetList(req, res, db, clientsDb, isAdmin);
  });

  router.post('/appointments', auth, async (req,res)=>{
    const body = req.body || {};
    productionLogger.debug(`[DEBUG_BANNER_SAVE] Received appointment update request from user ${req.user.id}:`, JSON.stringify(body, null, 2));
    
    // Safety check: se c'è un ID, verifica che l'appuntamento esista direttamente su Supabase
    if(body.id) {
      try {
        // Verifica esistenza direttamente su Supabase per evitare race conditions
        const { data: existingAppointment, error } = await supabase
          .from('appointments')
          .select('id, userid, client, start_time')
          .eq('id', body.id)
          .single();
        
        if (error || !existingAppointment) {
          console.warn(`[DEBUG_BANNER_SAVE] User ${req.user.id} attempted to update non-existent appointment ${body.id}`);
          productionLogger.error(`[DEBUG_BANNER_SAVE] Supabase error:`, error);
          return res.status(404).json({ error:'appointment not found - possible overwrite attempt' });
        }
        
        productionLogger.debug(`[DEBUG_BANNER_SAVE] Found existing appointment:`, existingAppointment);
        
        // Verifica ownership per sicurezza (più permissivo per VSS updates)
        if (existingAppointment.userid !== req.user.id && req.user.role !== 'admin') {
          // Permetti aggiornamenti VSS anche se l'appuntamento è di un altro utente
          // Questo è necessario per i banner post-vendita che possono essere visualizzati da admin
          const isVSSUpdate = body.vss !== undefined && Object.keys(body).length === 2 && body.id !== undefined;
          if (!isVSSUpdate) {
            console.warn(`[SAFETY_CHECK] User ${req.user.id} attempted to update appointment ${body.id} owned by ${existingAppointment.userid}`);
            return res.status(403).json({ error:'forbidden - appointment ownership mismatch' });
          }
        }
        
        // Log dell'operazione per monitoraggio
        productionLogger.debug(`[APPOINTMENT_UPDATE_REQUEST] User: ${req.user.id}, ID: ${body.id}, Client: ${existingAppointment.client}, Start: ${existingAppointment.start_time}`);
        
        return handleUpdate(req,res,body);
      } catch (error) {
        productionLogger.error(`[DEBUG_BANNER_SAVE] Error checking appointment existence:`, error);
        productionLogger.error(`[DEBUG_BANNER_SAVE] Error details:`, {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        return res.status(500).json({ error:'database error during validation' });
      }
    }
    return handleCreate(req,res,body);
  });

  function extractId(req){
    if (req && req.body && req.body.id) return String(req.body.id);
    if (req && req.query && req.query.id) return String(req.query.id);
    return '';
  }

  async function handleDelete(req, res){
    const id = extractId(req);
    if(!id) return res.status(400).json({ error:'missing id' });
    const db = await readJSON('appointments.json');
    const it = (db.appointments||[]).find(a => a.id===id);
    if(!it) return res.status(404).json({ error:'not found' });
    if(req.user.role!=='admin' && it.userId!==req.user.id) return res.status(403).json({ error:'forbidden' });
    // Usa deleteRecord per Supabase invece di writeJSON per evitare sovrascrittura
    if (typeof deleteRecord === 'function') {
      // Supabase: eliminazione singola
      await deleteRecord('appointments', id);
    }
    
    return res.json({ ok:true });
  }

  router.delete('/appointments', auth, async (req,res)=> handleDelete(req,res));
  
  // Aggiungi DELETE con parametro ID nell'URL
  router.delete('/appointments/:id', auth, async (req,res)=>{
    req.body = req.body || {};
    req.body.id = req.params.id;
    productionLogger.debug(`[DELETE_APPOINTMENT] Received DELETE request for appointment ${req.params.id} from user ${req.user.id}`);
    return handleDelete(req,res);
  });

  // Aggiungi PUT per supportare le chiamate da frontend
  router.put('/appointments/:id', auth, async (req,res)=>{
    const body = req.body || {};
    body.id = req.params.id; // Assicurati che l'ID sia nel body
    productionLogger.debug(`[PUT_APPOINTMENT] Received PUT request for appointment ${body.id} from user ${req.user.id}`);
    return handleUpdate(req,res,body);
  });

  return router;
};
