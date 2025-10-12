const express = require('express');

module.exports = function({ auth, readJSON, writeJSON, insertRecord, updateRecord, deleteRecord, genId }) {
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
      const db = await readJSON('open_cycles.json');
      const cycles = db.cycles || [];
      
      // Filtro per consulente se non admin
      let filteredCycles = cycles;
      if (req.user.role !== 'admin') {
        filteredCycles = cycles.filter(c => c.consultantId === req.user.id);
      }
      
      res.json({ cycles: filteredCycles });
    } catch (error) {
      console.error('Error fetching open cycles:', error);
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
          console.error('Error inserting cycle:', error);
          // Fallback al metodo tradizionale se Supabase fallisce
          db.cycles.push(cycle);
          await writeJSON('open_cycles.json', db);
        }
      }

      res.json({ ok: true, id: cycle.id, cycle });
    } catch (error) {
      console.error('Error creating cycle:', error);
      res.status(500).json({ error: 'Failed to create cycle' });
    }
  });

  // PUT /api/open-cycles - Aggiorna ciclo
  router.put('/open-cycles', auth, async (req, res) => {
    try {
      const body = req.body || {};
      const db = await readJSON('open_cycles.json');
      db.cycles = db.cycles || [];

      if (!body.id) {
        return res.status(400).json({ error: 'Cycle ID is required' });
      }

      const cycle = db.cycles.find(c => c.id === body.id);
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
          console.error('Error updating cycle:', error);
          // Fallback al metodo tradizionale se Supabase fallisce
          await writeJSON('open_cycles.json', db);
        }
      }

      res.json({ ok: true, id: cycle.id, cycle });
    } catch (error) {
      console.error('Error updating cycle:', error);
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

      const db = await readJSON('open_cycles.json');
      db.cycles = db.cycles || [];

      const cycle = db.cycles.find(c => c.id === id);
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
      console.error('Error deleting cycle:', error);
      res.status(500).json({ error: 'Failed to delete cycle' });
    }
  });

  // GET /api/open-cycles/forecast - Forecast per periodo
  router.get('/open-cycles/forecast', auth, async (req, res) => {
    try {
      const db = await readJSON('open_cycles.json');
      const cycles = db.cycles || [];
      
      // Filtro per consulente se non admin
      let filteredCycles = cycles;
      if (req.user.role !== 'admin') {
        filteredCycles = cycles.filter(c => c.consultantId === req.user.id);
      }

      // Filtra solo cicli aperti
      const openCycles = filteredCycles.filter(c => c.status === 'open');

      res.json({ cycles: openCycles });
    } catch (error) {
      console.error('Error fetching forecast:', error);
      res.status(500).json({ error: 'Failed to fetch forecast' });
    }
  });

  return router;
};
