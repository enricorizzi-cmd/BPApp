const express = require('express');

const productionLogger = require('../lib/production-logger');

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, genId, supabase, webpush, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY }){
  const router = express.Router();

  // ---- helpers ----
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const toStr = (v) => String(v || '');
  const toBool = (v) => !!v;
  const orEmpty = (v) => v || '';

  function copyIfPresent(target, src, key, transform) {
    if (has(src, key)) target[key] = transform ? transform(src[key]) : src[key];
  }

  // ---- Funzione per inviare notifica push per assegnazione consulente ----
  async function sendLeadAssignmentNotification(consultantId, leadData) {
    try {
      // Recupera i dati del consulente
      const { data: consultant, error: consultantError } = await supabase
        .from('app_users')
        .select('name, email')
        .eq('id', consultantId)
        .single();

      if (consultantError || !consultant) {
        productionLogger.error('Error fetching consultant for notification:', consultantError);
        return;
      }

      const consultantName = consultant.name || consultant.email || 'Consulente';
      const leadName = leadData.nomeLead || '';
      
      const message = `Ehi ${consultantName}, ti abbiamo assegnato il lead "${leadName}" da contattare entro 24h!`;
      
      // Invia notifica push direttamente usando webpush
      if (!webpush || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        productionLogger.debug('Push notifications not configured, skipping notification');
        return;
      }
      
      // Recupera le subscription del consulente
      try {
        const db = await readJSON("push_subscriptions.json");
        const subs = (db.subs || db.subscriptions || [])
          .filter(s => String(s.userId || '') === String(consultantId))
          .map(s => s.subscription || { endpoint: s.endpoint, keys: (s.keys || {}) })
          .filter(x => x && x.endpoint);
        
        if (subs.length === 0) {
          productionLogger.debug(`No push subscriptions found for consultant ${consultantId}`);
          return;
        }
        
        const payload = {
          title: "Battle Plan - Nuovo Lead Assegnato",
          body: message,
          url: "/",
          tag: "lead-assignment"
        };
        
        // Invia notifica a tutte le subscription del consulente
        await Promise.all(subs.map(async (sub) => {
          try {
            await webpush.sendNotification(sub, JSON.stringify(payload));
            console.log(`Lead assignment notification sent to consultant ${consultantId}`);
          } catch (error) {
            console.error(`Failed to send notification to consultant ${consultantId}:`, error.message);
          }
        }));
        
      } catch (error) {
        console.error('Error sending lead assignment notification:', error);
      }
    } catch (error) {
      console.error('Error in sendLeadAssignmentNotification:', error);
    }
  }

  // ---- Funzione per rilevare cambio consulente e inviare notifica ----
  async function checkAndNotifyConsultantChange(existingLead, newLeadData) {
    const oldConsultantId = existingLead?.consulente_assegnato;
    const newConsultantId = newLeadData.consulente_assegnato;

    // Solo se consulente è stato assegnato/modificato (non vuoto)
    if (newConsultantId && newConsultantId !== oldConsultantId) {
      await sendLeadAssignmentNotification(newConsultantId, newLeadData);
    }
  }

  // ---- Gestione GET lista lead ----
  async function handleGetList(req, res, isAdmin) {
    // Prova prima Supabase per dati aggiornati
    if (typeof supabase !== 'undefined' && supabase) {
      try {
        let query = supabase
          .from('leads')
          .select(`
            *,
            app_users!leads_consulente_assegnato_fkey(name, email)
          `)
          .order('data_inserimento', { ascending: false });
        
        // Filtri per consulente
        const consultantFilter = req.query.consultant;
        const withoutConsultant = req.query.withoutConsultant === 'true';
        const contactStatus = req.query.contactStatus || 'all';
        productionLogger.debug('🔍 DEBUG: contactStatus received =', contactStatus);
        productionLogger.debug('🔍 DEBUG: consultantFilter =', consultantFilter);
        productionLogger.debug('🔍 DEBUG: isAdmin =', isAdmin);
        
        if (consultantFilter && consultantFilter !== '') {
          query = query.eq('consulente_assegnato', consultantFilter);
          productionLogger.debug('🔍 DEBUG: Applied consultant filter:', consultantFilter);
        } else if (!isAdmin) {
          // Utente normale - solo i propri lead assegnati
          query = query.eq('consulente_assegnato', req.user.id);
          productionLogger.debug('🔍 DEBUG: Applied non-admin filter:', req.user.id);
        }
        
        // Filtro per lead senza consulente assegnato
        if (withoutConsultant) {
          query = query.is('consulente_assegnato', null);
          productionLogger.debug('🔍 DEBUG: Applied withoutConsultant filter');
        }
        
        // Filtro per stato contatto
        if (contactStatus === 'to_contact') {
          // Solo lead da contattare (contatto_avvenuto null)
          query = query.is('contatto_avvenuto', null);
          productionLogger.debug('🔍 DEBUG: Applied to_contact filter (contatto_avvenuto IS NULL)');
        } else if (contactStatus === 'contacted') {
          // Solo lead già contattati (contatto_avvenuto compilato)
          query = query.not('contatto_avvenuto', 'is', null);
          productionLogger.debug('🔍 DEBUG: Applied contacted filter (contatto_avvenuto IS NOT NULL)');
        }
        // Se contactStatus === 'all', non applicare nessun filtro
        
        // Filtro per periodo se specificato
        // NOTA: 
        // - Se contactStatus è 'contacted', filtriamo per contatto_avvenuto nel periodo
        // - Se contactStatus è 'to_contact', NON applichiamo il filtro periodo (mostriamo tutti i lead non contattati)
        // - Altrimenti filtriamo per data_inserimento nel periodo
        const periodFilter = req.query.period;
        const fromDate = req.query.from;
        const toDate = req.query.to;
        
        // NON applicare filtro periodo se contactStatus è 'to_contact'
        if (contactStatus !== 'to_contact') {
          if (fromDate && toDate) {
            if (contactStatus === 'contacted') {
              // Per lead contattati, filtra per data di contatto nel periodo
              query = query.gte('contatto_avvenuto', fromDate);
              query = query.lte('contatto_avvenuto', toDate);
            } else {
              // Per 'all', filtra per data di inserimento nel periodo
              query = query.gte('data_inserimento', fromDate);
              query = query.lte('data_inserimento', toDate);
            }
          } else if (periodFilter && periodFilter !== '') {
          // Fallback alla logica precedente se from/to non sono forniti
          const now = new Date();
          let startDate, endDate;
          
          switch (periodFilter) {
            case 'giornaliera':
              startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
              break;
            case 'settimanale': {
              const startOfWeek = new Date(now);
              startOfWeek.setDate(now.getDate() - now.getDay());
              startDate = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate());
              endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
              break;
            }
            case 'mensile':
              startDate = new Date(now.getFullYear(), now.getMonth(), 1);
              endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
              break;
            case 'trimestrale': {
              const quarter = Math.floor(now.getMonth() / 3);
              startDate = new Date(now.getFullYear(), quarter * 3, 1);
              endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 1);
              break;
            }
            case 'semestrale': {
              const semester = Math.floor(now.getMonth() / 6);
              startDate = new Date(now.getFullYear(), semester * 6, 1);
              endDate = new Date(now.getFullYear(), (semester + 1) * 6, 1);
              break;
            }
            case 'annuale':
              startDate = new Date(now.getFullYear(), 0, 1);
              endDate = new Date(now.getFullYear() + 1, 0, 1);
              break;
          }
          
          if (startDate && endDate) {
            if (contactStatus === 'contacted') {
              // Per lead contattati, filtra per data di contatto nel periodo
              query = query.gte('contatto_avvenuto', startDate.toISOString()).lte('contatto_avvenuto', endDate.toISOString());
            } else {
              // Per 'all', filtra per data di inserimento nel periodo
              query = query.gte('data_inserimento', startDate.toISOString()).lte('data_inserimento', endDate.toISOString());
            }
          }
          }
        }
        // Se contactStatus è 'to_contact', non applichiamo il filtro periodo
        
        const { data, error } = await query;
        
        if (error) {
          console.error('Supabase error in handleGetList:', error);
          throw error;
        }
        
        productionLogger.debug('🔍 DEBUG: Query returned', (data || []).length, 'leads');
        if (contactStatus === 'to_contact') {
          productionLogger.debug('🔍 DEBUG: Filtering for to_contact - found', (data || []).length, 'leads with contatto_avvenuto IS NULL');
        }
        
        // Mappa i dati da Supabase al formato frontend
        const leads = (data || []).map(row => {
          return {
            id: row.id,
            dataInserimento: row.data_inserimento,
            nomeLead: row.nome_lead,
            aziendaLead: row.azienda_lead,
            settoreLead: row.settore_lead,
            numeroTelefono: row.numero_telefono,
            indirizzoMail: row.indirizzo_mail,
            provincia: row.provincia,
            comune: row.comune,
            indirizzo: row.indirizzo,
            sorgente: row.sorgente,
            consulenteAssegnato: row.consulente_assegnato,
            consulenteNome: row.app_users?.name || row.app_users?.email || '',
            note: row.note,
            contattoAvvenuto: row.contatto_avvenuto,
            contactBannerAnswered: !!row.contact_banner_answered,
            createdAt: row.createdat,
            updatedAt: row.updatedat
          };
        });
        
        return res.json({ leads });
      } catch (err) {
        console.error('Error fetching from Supabase, falling back to JSON:', err);
      }
    }
    
    // Fallback al metodo tradizionale (se necessario)
    const db = await readJSON('leads.json');
    const all = db.leads || [];
    let list = all;
    
    // Applica filtri
    if (!isAdmin) {
      list = all.filter(lead => lead.consulenteAssegnato === req.user.id);
    } else if (req.query.consultant && req.query.consultant !== '') {
      list = all.filter(lead => lead.consulenteAssegnato === req.query.consultant);
    }
    
    return res.json({ leads: list });
  }

  // ---- Gestione GET singolo lead ----
  async function handleGetById(req, res, isAdmin) {
    const leadId = req.query.id;
    if (!leadId) return res.status(400).json({ error: 'missing id' });

    try {
      const { data: lead, error } = await supabase
        .from('leads')
        .select(`
          *,
          app_users!leads_consulente_assegnato_fkey(name, email)
        `)
        .eq('id', leadId)
        .single();

      if (error || !lead) {
        return res.status(404).json({ error: 'lead not found' });
      }

      // Verifica permessi
      if (!isAdmin && lead.consulente_assegnato !== req.user.id) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const mappedLead = {
        id: lead.id,
        dataInserimento: lead.data_inserimento,
        nomeLead: lead.nome_lead,
        aziendaLead: lead.azienda_lead,
        settoreLead: lead.settore_lead,
        numeroTelefono: lead.numero_telefono,
        indirizzoMail: lead.indirizzo_mail,
        provincia: lead.provincia,
        comune: lead.comune,
        indirizzo: lead.indirizzo,
        sorgente: lead.sorgente,
        consulenteAssegnato: lead.consulente_assegnato,
        consulenteNome: lead.app_users?.name || lead.app_users?.email || '',
        note: lead.note,
        contattoAvvenuto: lead.contatto_avvenuto,
        contactBannerAnswered: !!lead.contact_banner_answered,
        createdAt: lead.createdat,
        updatedAt: lead.updatedat
      };

      return res.json({ lead: mappedLead });
    } catch (error) {
      console.error('Error fetching lead by ID:', error);
      return res.status(500).json({ error: 'database error' });
    }
  }

  // ---- Gestione CREATE lead ----
  async function handleCreate(req, res, body) {
    if (!body.nomeLead) {
      return res.status(400).json({ error: 'missing nomeLead' });
    }

    // Verifica vincolo telefono o email
    if (!body.numeroTelefono && !body.indirizzoMail) {
      return res.status(400).json({ error: 'numeroTelefono or indirizzoMail required' });
    }

    const nowIso = new Date().toISOString();
    const leadId = body.id || genId();
    
    const lead = {
      id: leadId,
      dataInserimento: body.dataInserimento || nowIso,
      nomeLead: String(body.nomeLead),
      aziendaLead: toStr(body.aziendaLead),
      settoreLead: toStr(body.settoreLead),
      numeroTelefono: toStr(body.numeroTelefono),
      indirizzoMail: toStr(body.indirizzoMail),
      provincia: toStr(body.provincia),
      comune: toStr(body.comune),
      indirizzo: toStr(body.indirizzo),
      sorgente: toStr(body.sorgente),
      consulenteAssegnato: toStr(body.consulenteAssegnato),
      note: toStr(body.note),
      contattoAvvenuto: toStr(body.contattoAvvenuto),
      contactBannerAnswered: toBool(body.contactBannerAnswered),
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // Usa insertRecord per Supabase
    if (typeof insertRecord === 'function') {
      try {
        const mappedLead = {
          id: lead.id,
          data_inserimento: lead.dataInserimento,
          nome_lead: lead.nomeLead,
          azienda_lead: lead.aziendaLead,
          settore_lead: lead.settoreLead,
          numero_telefono: lead.numeroTelefono,
          indirizzo_mail: lead.indirizzoMail,
          provincia: lead.provincia,
          comune: lead.comune,
          indirizzo: lead.indirizzo,
          sorgente: lead.sorgente,
          consulente_assegnato: lead.consulenteAssegnato && lead.consulenteAssegnato.trim() !== '' ? lead.consulenteAssegnato : null,
          note: lead.note,
          contatto_avvenuto: lead.contattoAvvenuto,
          contact_banner_answered: lead.contactBannerAnswered,
          createdat: lead.createdAt,
          updatedat: lead.updatedAt
        };

        await insertRecord('leads', mappedLead);

        // Invia notifica se consulente assegnato
        if (lead.consulenteAssegnato) {
          await sendLeadAssignmentNotification(lead.consulenteAssegnato, lead);
        }

        console.log(`[LEAD_CREATED] User: ${req.user.id}, ID: ${lead.id}, Nome: ${lead.nomeLead}`);
        
        return res.json({ ok: true, id: lead.id });
      } catch (error) {
        console.error('Error inserting lead:', error);
        return res.status(500).json({ error: 'Failed to save lead' });
      }
    }

    return res.json({ ok: true, id: lead.id });
  }

  // ---- Gestione UPDATE lead ----
  async function handleUpdate(req, res, body) {
    if (!body.id) {
      return res.status(400).json({ error: 'missing id' });
    }

    try {
      // Recupera il lead esistente
      const { data: existingLead, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', body.id)
        .single();

      if (error || !existingLead) {
        return res.status(404).json({ error: 'lead not found' });
      }

      // Verifica permessi
      if (req.user.role !== 'admin' && existingLead.consulente_assegnato !== req.user.id) {
        return res.status(403).json({ error: 'forbidden' });
      }

      // Verifica vincolo telefono o email se vengono modificati
      const newPhone = body.numeroTelefono !== undefined ? body.numeroTelefono : existingLead.numero_telefono;
      const newEmail = body.indirizzoMail !== undefined ? body.indirizzoMail : existingLead.indirizzo_mail;
      
      if (!newPhone && !newEmail) {
        return res.status(400).json({ error: 'numeroTelefono or indirizzoMail required' });
      }

      // Prepara i dati per l'aggiornamento
      const mappedUpdates = {
        updatedat: new Date().toISOString()
      };

      // Aggiorna solo i campi presenti nel body
      if (body.dataInserimento !== undefined) mappedUpdates.data_inserimento = body.dataInserimento;
      if (body.nomeLead !== undefined) mappedUpdates.nome_lead = String(body.nomeLead);
      if (body.aziendaLead !== undefined) mappedUpdates.azienda_lead = toStr(body.aziendaLead);
      if (body.settoreLead !== undefined) mappedUpdates.settore_lead = toStr(body.settoreLead);
      if (body.numeroTelefono !== undefined) mappedUpdates.numero_telefono = toStr(body.numeroTelefono);
      if (body.indirizzoMail !== undefined) mappedUpdates.indirizzo_mail = toStr(body.indirizzoMail);
      if (body.provincia !== undefined) mappedUpdates.provincia = toStr(body.provincia);
      if (body.comune !== undefined) mappedUpdates.comune = toStr(body.comune);
      if (body.indirizzo !== undefined) mappedUpdates.indirizzo = toStr(body.indirizzo);
      if (body.sorgente !== undefined) mappedUpdates.sorgente = toStr(body.sorgente);
      if (body.consulenteAssegnato !== undefined) {
        mappedUpdates.consulente_assegnato = body.consulenteAssegnato && body.consulenteAssegnato.trim() !== '' ? toStr(body.consulenteAssegnato) : null;
      }
      if (body.note !== undefined) mappedUpdates.note = toStr(body.note);
      if (body.contattoAvvenuto !== undefined) mappedUpdates.contatto_avvenuto = toStr(body.contattoAvvenuto);
      if (body.contactBannerAnswered !== undefined) mappedUpdates.contact_banner_answered = toBool(body.contactBannerAnswered);
      if (body.editing_by !== undefined) mappedUpdates.editing_by = toStr(body.editing_by);
      if (body.editing_at !== undefined) mappedUpdates.editing_at = toStr(body.editing_at);

      await updateRecord('leads', body.id, mappedUpdates);

      // Controlla se il consulente è cambiato e invia notifica
      const newLeadData = {
        nome_lead: mappedUpdates.nome_lead || existingLead.nome_lead,
        consulente_assegnato: mappedUpdates.consulente_assegnato || existingLead.consulente_assegnato
      };
      
      await checkAndNotifyConsultantChange(existingLead, newLeadData);

      console.log(`[LEAD_UPDATED] User: ${req.user.id}, ID: ${body.id}, Nome: ${newLeadData.nome_lead}`);
      
      return res.json({ ok: true, id: body.id });
    } catch (error) {
      console.error('Error updating lead:', error);
      return res.status(500).json({ error: 'Failed to update lead' });
    }
  }

  // ---- Gestione DELETE lead ----
  async function handleDelete(req, res) {
    const leadId = req.body?.id || req.query?.id;
    if (!leadId) return res.status(400).json({ error: 'missing id' });

    try {
      // Verifica esistenza e permessi
      const { data: lead, error } = await supabase
        .from('leads')
        .select('id, consulente_assegnato')
        .eq('id', leadId)
        .single();

      if (error || !lead) {
        return res.status(404).json({ error: 'lead not found' });
      }

      if (req.user.role !== 'admin' && lead.consulente_assegnato !== req.user.id) {
        return res.status(403).json({ error: 'forbidden' });
      }

      await deleteRecord('leads', leadId);

      console.log(`[LEAD_DELETED] User: ${req.user.id}, ID: ${leadId}`);
      
      return res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting lead:', error);
      return res.status(500).json({ error: 'Failed to delete lead' });
    }
  }

  // ---- Routes ----
  router.get('/leads', auth, async (req, res) => {
    const isAdmin = (req.user.role === 'admin');
    
    if (req.query.id) {
      return handleGetById(req, res, isAdmin);
    }
    
    return handleGetList(req, res, isAdmin);
  });

  router.post('/leads', auth, async (req, res) => {
    const body = req.body || {};
    
    if (body.id) {
      return handleUpdate(req, res, body);
    }
    
    return handleCreate(req, res, body);
  });

  router.delete('/leads', auth, async (req, res) => {
    return handleDelete(req, res);
  });

  return router;
};

