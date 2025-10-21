/**
 * Vendite & Riordini API Routes
 * Gestisce preventivi e proposte commerciali
 */

const { auth } = require('../services/auth');
const { supabase } = require('../lib/storage-supabase');

module.exports = function(app) {

  // ===== GET /api/vendite-riordini =====
  app.get("/api/vendite-riordini", auth, async (req, res) => {
    try {
      const { from, to, userId, global, user } = req.query || {};
      const isAdmin = (req.user.role === "admin");

      // Costruisci query base
      let query = supabase
        .from('vendite_riordini')
        .select('*')
        .order('data', { ascending: false });

      // Filtri visibilità
      const targetUserId = userId || user;
      
      if (!isAdmin) {
        query = query.eq('consultantid', req.user.id);
      } else if (global === '1') {
        // Admin con global=1: mostra tutti i dati
        query = query;
      } else if (targetUserId) {
        query = query.eq('consultantid', targetUserId);
      }

      // Filtro data
      if (from) {
        query = query.gte('data', from);
      }
      if (to) {
        query = query.lte('data', to);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[VenditeRiordini] Query error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      res.json({ vendite: data || [] });

    } catch (error) {
      console.error('[VenditeRiordini] GET error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== POST /api/vendite-riordini =====
  app.post("/api/vendite-riordini", auth, async (req, res) => {
    try {
      const {
        data: venditaData,
        cliente_id, // Nuovo campo
        cliente,
        consulente,
        descrizione_servizi,
        valore_proposto,
        data_feedback,
        stato = 'da_presentare'
      } = req.body;

      // Validazione campi obbligatori
      if (!venditaData || !cliente_id || !cliente || !consulente || !data_feedback) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti' });
      }

      // Genera ID univoco
      const id = 'vr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

      // Prepara dati per inserimento
      const venditaRecord = {
        id,
        data: venditaData,
        cliente_id, // Aggiunto campo cliente_id
        cliente,
        consulente,
        consultantid: req.user.id, // SEMPRE per l'utente corrente
        descrizione_servizi: descrizione_servizi || '',
        valore_proposto: Number(valore_proposto) || 0,
        data_feedback,
        stato,
        valore_confermato: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: insertedData, error } = await supabase
        .from('vendite_riordini')
        .insert([venditaRecord])
        .select()
        .single();

      if (error) {
        console.error('[VenditeRiordini] Insert error:', error);
        return res.status(500).json({ error: 'Failed to create vendita' });
      }

      res.json({ vendita: insertedData });

    } catch (error) {
      console.error('[VenditeRiordini] POST error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== PUT /api/vendite-riordini =====
  app.put("/api/vendite-riordini", auth, async (req, res) => {
    try {
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'ID mancante' });
      }

      // Verifica che l'utente possa modificare questo record
      const { data: existingRecord, error: fetchError } = await supabase
        .from('vendite_riordini')
        .select('consultantid')
        .eq('id', id)
        .single();

      if (fetchError) {
        return res.status(404).json({ error: 'Record non trovato' });
      }

      // Solo il proprietario può modificare (o admin)
      if (req.user.role !== 'admin' && existingRecord.consultantid !== req.user.id) {
        return res.status(403).json({ error: 'Non autorizzato' });
      }

      // Prepara aggiornamenti
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      // Se stato cambia a 'confermato', auto-compila valore_confermato
      if (updates.stato === 'confermato' && !updates.valore_confermato) {
        const { data: currentRecord } = await supabase
          .from('vendite_riordini')
          .select('valore_proposto')
          .eq('id', id)
          .single();
        
        if (currentRecord) {
          updateData.valore_confermato = currentRecord.valore_proposto;
        }
      }

      const { data: updatedData, error } = await supabase
        .from('vendite_riordini')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[VenditeRiordini] Update error:', error);
        return res.status(500).json({ error: 'Failed to update vendita' });
      }

      res.json({ vendita: updatedData });

    } catch (error) {
      console.error('[VenditeRiordini] PUT error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== DELETE /api/vendite-riordini =====
  app.delete("/api/vendite-riordini", auth, async (req, res) => {
    try {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'ID mancante' });
      }

      // Verifica che l'utente possa eliminare questo record
      const { data: existingRecord, error: fetchError } = await supabase
        .from('vendite_riordini')
        .select('consultantid')
        .eq('id', id)
        .single();

      if (fetchError) {
        return res.status(404).json({ error: 'Record non trovato' });
      }

      // Solo il proprietario può eliminare (o admin)
      if (req.user.role !== 'admin' && existingRecord.consultantid !== req.user.id) {
        return res.status(403).json({ error: 'Non autorizzato' });
      }

      const { error } = await supabase
        .from('vendite_riordini')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[VenditeRiordini] Delete error:', error);
        return res.status(500).json({ error: 'Failed to delete vendita' });
      }

      res.json({ success: true });

    } catch (error) {
      console.error('[VenditeRiordini] DELETE error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== GET /api/vendite-riordini/stats =====
  app.get("/api/vendite-riordini/stats", auth, async (req, res) => {
    try {
      const { from, to, userId, global, user } = req.query || {};
      const isAdmin = (req.user.role === "admin");

      // Costruisci query base
      let query = supabase
        .from('vendite_riordini')
        .select('*');

      // Filtri visibilità
      const targetUserId = userId || user;
      
      if (!isAdmin) {
        query = query.eq('consultantid', req.user.id);
      } else if (global === '1') {
        // Admin con global=1: mostra tutti i dati
        query = query;
      } else if (targetUserId) {
        query = query.eq('consultantid', targetUserId);
      }

      // Filtro data
      if (from) {
        query = query.gte('data', from);
      }
      if (to) {
        query = query.lte('data', to);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[VenditeRiordini] Stats query error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      // Calcola statistiche
      const vendite = data || [];
      
      // Clienti unici con proposte
      const clientiUnici = new Set(vendite.map(v => v.cliente)).size;
      
      // Valore totale proposto
      const valoreProposto = vendite.reduce((sum, v) => sum + Number(v.valore_proposto || 0), 0);
      
      // Numero confermati
      const confermati = vendite.filter(v => v.stato === 'confermato').length;
      
      // Tasso accettazione
      const tassoAccettazione = clientiUnici > 0 ? (confermati / clientiUnici) * 100 : 0;
      
      // Valore confermato
      const valoreConfermato = vendite.reduce((sum, v) => sum + Number(v.valore_confermato || 0), 0);

      const stats = {
        n_proposte: clientiUnici,
        valore_proposto: valoreProposto,
        tasso_accettazione: Math.round(tassoAccettazione * 100) / 100,
        valore_confermato: valoreConfermato
      };

      res.json({ stats });

    } catch (error) {
      console.error('[VenditeRiordini] Stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

};
