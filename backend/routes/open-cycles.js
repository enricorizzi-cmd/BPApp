const express = require('express');
const productionLogger = require('../lib/production-logger');

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, genId, supabase }) {
  const router = express.Router();

  // Helper functions
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const toStr = (v) => String(v || '');
  const toPriority = (v) => {
    const valid = ['urgent', 'important', 'standard'];
    return valid.includes(v) ? v : 'standard';
  };
  const toDeadlineType = (v) => {
    const valid = ['none', 'single', 'multiple', 'recurring'];
    return valid.includes(v) ? v : 'none';
  };
  const toStatus = (v) => {
    const valid = ['open', 'closed'];
    return valid.includes(v) ? v : 'open';
  };

  function copyIfPresent(target, src, key, transform) {
    if (has(src, key)) target[key] = transform ? transform(src[key]) : src[key];
  }

  // GET /api/open-cycles - Lista cicli
  router.get('/open-cycles', auth, async (req, res) => {
    try {
      productionLogger.debug('[DEBUG] GET /api/open-cycles - req.user:', req.user);
      let cycles = [];
      
      // Prova prima Supabase se disponibile
      if (typeof supabase !== 'undefined' && supabase) {
        try {
          productionLogger.debug('[DEBUG] Supabase client available, querying open_cycles table...');
          const { data, error } = await supabase
            .from('open_cycles')
            .select('*')
            .order('createdat', { ascending: false });
          
          productionLogger.debug('[DEBUG] Supabase query result - data:', data);
          productionLogger.debug('[DEBUG] Supabase query result - error:', error);
          
          if (error) {
            productionLogger.error('Supabase error:', error);
            throw error;
          }
          
          // Mappa i dati da Supabase al formato frontend
          cycles = (data || []).map(row => ({
            id: row.id,
            consultantId: row.consultantid,
            consultantName: row.consultantname,
            description: row.description,
            priority: row.priority,
            deadlineType: row.deadlinetype,
            deadlineData: row.deadlinedata || {},
            status: row.status,
            createdAt: row.createdat,
            updatedAt: row.updatedat
          }));
        } catch (error) {
          productionLogger.error('Error fetching from Supabase:', error);
          // Fallback al metodo tradizionale
          const db = await readJSON('open_cycles.json');
          cycles = db.cycles || [];
        }
      } else {
        // Fallback al metodo tradizionale
        const db = await readJSON('open_cycles.json');
        cycles = db.cycles || [];
      }
      
      // Filtro per consulente se non admin
      let filteredCycles = cycles;
      productionLogger.debug('[DEBUG] Total cycles from Supabase:', cycles.length);
      productionLogger.debug('[DEBUG] User role:', req.user.role);
      productionLogger.debug('[DEBUG] User id:', req.user.id);
      
      if (req.user.role !== 'admin') {
        filteredCycles = cycles.filter(c => c.consultantId === req.user.id);
        productionLogger.debug('[DEBUG] Filtered cycles for non-admin:', filteredCycles.length);
      } else {
        productionLogger.debug('[DEBUG] Admin user - showing all cycles');
      }
      
      productionLogger.debug('[DEBUG] Final cycles to return:', filteredCycles.length);
      res.json({ cycles: filteredCycles });
    } catch (error) {
      productionLogger.error('Error fetching open cycles:', error);
      res.status(500).json({ error: 'Failed to fetch cycles' });
    }
  });

  // POST /api/open-cycles - Crea ciclo
  router.post('/open-cycles', auth, async (req, res) => {
    try {
      const body = req.body || {};
      const db = await readJSON('open_cycles.json');
      db.cycles = db.cycles || [];

      // Validazione campi obbligatori
      if (!body.description || !body.description.trim()) {
        return res.status(400).json({ error: 'Description is required' });
      }

      const nowIso = new Date().toISOString();
      const cycle = {
        id: genId(),
        consultantId: req.user.id,
        consultantName: req.user.name || 'Unknown',
        description: toStr(body.description).trim(),
        priority: toPriority(body.priority),
        deadlineType: toDeadlineType(body.deadlineType),
        deadlineData: body.deadlineData || {},
        status: toStatus(body.status),
        createdAt: nowIso,
        updatedAt: nowIso
      };

      // Usa insertRecord per Supabase invece di writeJSON per evitare sovrascrittura
      if (typeof insertRecord === 'function') {
        try {
          const mappedCycle = {
            id: cycle.id,
            consultantid: cycle.consultantId,
            consultantname: cycle.consultantName,
            description: cycle.description,
            priority: cycle.priority,
            deadlinetype: cycle.deadlineType,
            deadlinedata: cycle.deadlineData,
            status: cycle.status,
            createdat: cycle.createdAt,
            updatedat: cycle.updatedAt
          };
          await insertRecord('open_cycles', mappedCycle);
        } catch (error) {
          productionLogger.error('Error inserting cycle:', error);
          // Fallback al metodo tradizionale se Supabase fallisce
          db.cycles.push(cycle);
          await writeJSON('open_cycles.json', db);
        }
      }

      res.json({ ok: true, id: cycle.id, cycle });
    } catch (error) {
      productionLogger.error('Error creating cycle:', error);
      res.status(500).json({ error: 'Failed to create cycle' });
    }
  });

  // PUT /api/open-cycles - Aggiorna ciclo
  router.put('/open-cycles', auth, async (req, res) => {
    try {
      const body = req.body || {};

      if (!body.id) {
        return res.status(400).json({ error: 'Cycle ID is required' });
      }

      let cycle = null;
      
      // Prova prima Supabase se disponibile
      if (typeof supabase !== 'undefined' && supabase) {
        try {
          const { data, error } = await supabase
            .from('open_cycles')
            .select('*')
            .eq('id', body.id)
            .single();
          
          if (error) {
            productionLogger.error('Supabase error:', error);
            throw error;
          }
          
          if (!data) {
            return res.status(404).json({ error: 'Cycle not found' });
          }
          
          // Mappa i dati da Supabase al formato frontend
          cycle = {
            id: data.id,
            consultantId: data.consultantid,
            consultantName: data.consultantname,
            description: data.description,
            priority: data.priority,
            deadlineType: data.deadlinetype,
            deadlineData: data.deadlinedata || {},
            status: data.status,
            createdAt: data.createdat,
            updatedAt: data.updatedat
          };
        } catch (error) {
          productionLogger.error('Error fetching from Supabase:', error);
          // Fallback al metodo tradizionale
          const db = await readJSON('open_cycles.json');
          db.cycles = db.cycles || [];
          cycle = db.cycles.find(c => c.id === body.id);
        }
      } else {
        // Fallback al metodo tradizionale
        const db = await readJSON('open_cycles.json');
        db.cycles = db.cycles || [];
        cycle = db.cycles.find(c => c.id === body.id);
      }

      if (!cycle) {
        return res.status(404).json({ error: 'Cycle not found' });
      }

      // Verifica permessi
      if (req.user.role !== 'admin' && cycle.consultantId !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Aggiorna campi
      copyIfPresent(cycle, body, 'description', toStr);
      copyIfPresent(cycle, body, 'priority', toPriority);
      copyIfPresent(cycle, body, 'deadlineType', toDeadlineType);
      copyIfPresent(cycle, body, 'status', toStatus);
      
      if (has(body, 'deadlineData')) {
        cycle.deadlineData = body.deadlineData;
      }

      cycle.updatedAt = new Date().toISOString();

      // Usa updateRecord per Supabase invece di writeJSON per evitare sovrascrittura
      if (typeof updateRecord === 'function') {
        try {
          const mappedUpdates = {
            consultantid: cycle.consultantId,
            consultantname: cycle.consultantName,
            description: cycle.description,
            priority: cycle.priority,
            deadlinetype: cycle.deadlineType,
            deadlinedata: cycle.deadlineData,
            status: cycle.status,
            updatedat: cycle.updatedAt
          };
          await updateRecord('open_cycles', cycle.id, mappedUpdates);
        } catch (error) {
          productionLogger.error('Error updating cycle:', error);
          // Fallback al metodo tradizionale se Supabase fallisce
          const db = await readJSON('open_cycles.json');
          db.cycles = db.cycles || [];
          const cycleIndex = db.cycles.findIndex(c => c.id === cycle.id);
          if (cycleIndex !== -1) {
            db.cycles[cycleIndex] = cycle;
            await writeJSON('open_cycles.json', db);
          }
        }
      }

      res.json({ ok: true, id: cycle.id, cycle });
    } catch (error) {
      productionLogger.error('Error updating cycle:', error);
      res.status(500).json({ error: 'Failed to update cycle' });
    }
  });

  // DELETE /api/open-cycles - Elimina ciclo
  router.delete('/open-cycles', auth, async (req, res) => {
    try {
      const id = req.query.id;
      if (!id) {
        return res.status(400).json({ error: 'Cycle ID is required' });
      }

      let cycle = null;
      
      // Prova prima Supabase se disponibile
      if (typeof supabase !== 'undefined' && supabase) {
        try {
          const { data, error } = await supabase
            .from('open_cycles')
            .select('*')
            .eq('id', id)
            .single();
          
          if (error) {
            productionLogger.error('Supabase error:', error);
            throw error;
          }
          
          if (!data) {
            return res.status(404).json({ error: 'Cycle not found' });
          }
          
          // Mappa i dati da Supabase al formato frontend
          cycle = {
            id: data.id,
            consultantId: data.consultantid,
            consultantName: data.consultantname,
            description: data.description,
            priority: data.priority,
            deadlineType: data.deadlinetype,
            deadlineData: data.deadlinedata || {},
            status: data.status,
            createdAt: data.createdat,
            updatedAt: data.updatedat
          };
        } catch (error) {
          productionLogger.error('Error fetching from Supabase:', error);
          // Fallback al metodo tradizionale
          const db = await readJSON('open_cycles.json');
          db.cycles = db.cycles || [];
          cycle = db.cycles.find(c => c.id === id);
        }
      } else {
        // Fallback al metodo tradizionale
        const db = await readJSON('open_cycles.json');
        db.cycles = db.cycles || [];
        cycle = db.cycles.find(c => c.id === id);
      }

      if (!cycle) {
        return res.status(404).json({ error: 'Cycle not found' });
      }

      // Verifica permessi
      if (req.user.role !== 'admin' && cycle.consultantId !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Usa deleteRecord per Supabase invece di writeJSON per evitare sovrascrittura
      if (typeof deleteRecord === 'function') {
        await deleteRecord('open_cycles', id);
      }

      res.json({ ok: true });
    } catch (error) {
      productionLogger.error('Error deleting cycle:', error);
      res.status(500).json({ error: 'Failed to delete cycle' });
    }
  });

  // GET /api/open-cycles/forecast - Forecast per periodo
  router.get('/open-cycles/forecast', auth, async (req, res) => {
    try {
      let cycles = [];
      
      // Prova prima Supabase se disponibile
      if (typeof supabase !== 'undefined' && supabase) {
        try {
          const { data, error } = await supabase
            .from('open_cycles')
            .select('*')
            .eq('status', 'open')
            .order('createdat', { ascending: false });
          
          if (error) {
            productionLogger.error('Supabase error:', error);
            throw error;
          }
          
          // Mappa i dati da Supabase al formato frontend
          cycles = (data || []).map(row => ({
            id: row.id,
            consultantId: row.consultantid,
            consultantName: row.consultantname,
            description: row.description,
            priority: row.priority,
            deadlineType: row.deadlinetype,
            deadlineData: row.deadlinedata || {},
            status: row.status,
            createdAt: row.createdat,
            updatedAt: row.updatedat
          }));
        } catch (error) {
          productionLogger.error('Error fetching from Supabase:', error);
          // Fallback al metodo tradizionale
          const db = await readJSON('open_cycles.json');
          cycles = db.cycles || [];
        }
      } else {
        // Fallback al metodo tradizionale
        const db = await readJSON('open_cycles.json');
        cycles = db.cycles || [];
      }
      
      // Filtro per consulente se non admin
      let filteredCycles = cycles;
      if (req.user.role !== 'admin') {
        filteredCycles = cycles.filter(c => c.consultantId === req.user.id);
      }

      // Filtra solo cicli aperti
      const openCycles = filteredCycles.filter(c => c.status === 'open');

      res.json({ cycles: openCycles });
    } catch (error) {
      productionLogger.error('Error fetching forecast:', error);
      res.status(500).json({ error: 'Failed to fetch forecast' });
    }
  });

  // Test endpoint per verificare connessione Supabase (senza auth per debug)
  router.get('/open-cycles/test', async (req, res) => {
    try {
      productionLogger.debug('[DEBUG] Testing Supabase connection...');
      
      if (typeof supabase === 'undefined' || !supabase) {
        return res.json({ error: 'Supabase client not available' });
      }
      
      // Test query semplice
      const { data, error } = await supabase
        .from('open_cycles')
        .select('count')
        .limit(1);
      
      productionLogger.debug('[DEBUG] Test query result:', { data, error });
      
      if (error) {
        return res.json({ error: error.message, code: error.code });
      }
      
      // Test query con tutti i dati
      const { data: allData, error: allError } = await supabase
        .from('open_cycles')
        .select('*')
        .limit(5);
      
      productionLogger.debug('[DEBUG] All data query result:', { allData, allError });
      
      res.json({ 
        success: true, 
        count: data,
        sample: allData,
        error: allError
      });
    } catch (error) {
      productionLogger.error('[DEBUG] Test endpoint error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
