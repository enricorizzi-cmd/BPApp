/**
 * Corsi Interaziendali API Routes
 * Gestisce catalogo corsi, date corsi e iscrizioni
 */

const { auth } = require('../services/auth');
const { supabase } = require('../lib/storage-supabase');

module.exports = function(app) {

  // ===== CORSI CATALOGO =====

  // GET /api/corsi-catalogo - Lista corsi con filtri
  app.get("/api/corsi-catalogo", auth, async (req, res) => {
    try {
      const { from, to, tutti_corsi } = req.query || {};
      const isAdmin = (req.user.role === "admin");

      // Costruisci query base
      let query = supabase
        .from('corsi_catalogo')
        .select(`
          *,
          corsi_date(id, data_inizio)
        `)
        .order('nome_corso', { ascending: true });

      const { data, error } = await query;

      if (error) {
        console.error('[CorsiCatalogo] Query error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      // Filtra i dati in base ai parametri
      let filteredData = data || [];
      
      // Filtro periodo (solo se tutti_corsi non è true)
      if (tutti_corsi !== 'true' && from && to) {
        filteredData = filteredData.filter(corso => 
          corso.corsi_date && corso.corsi_date.some(date => 
            date.data_inizio >= from && date.data_inizio <= to
          )
        );
      } else if (tutti_corsi !== 'true') {
        // Se non specificato periodo, mostra solo corsi con date
        filteredData = filteredData.filter(corso => 
          corso.corsi_date && corso.corsi_date.length > 0
        );
      }

      // Processa i dati per includere conteggio date
      const processedData = filteredData.map(corso => ({
        ...corso,
        date_programmate: corso.corsi_date ? corso.corsi_date.length : 0
      }));

      res.json({ corsi: processedData });

    } catch (error) {
      console.error('[CorsiCatalogo] GET error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/corsi-catalogo - Crea nuovo corso
  app.post("/api/corsi-catalogo", auth, async (req, res) => {
    try {
      // Solo admin può creare corsi
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo admin può creare corsi' });
      }

      const {
        codice_corso,
        nome_corso,
        descrizione,
        durata_giorni,
        costo_corso = 0
      } = req.body;

      // Validazione campi obbligatori
      if (!codice_corso || !nome_corso || !durata_giorni) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti' });
      }

      if (durata_giorni <= 0) {
        return res.status(400).json({ error: 'Durata deve essere maggiore di 0' });
      }

      // Genera ID univoco
      const id = 'corso_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

      // Prepara dati per inserimento
      const corsoRecord = {
        id,
        codice_corso,
        nome_corso,
        descrizione: descrizione || '',
        durata_giorni: Number(durata_giorni),
        costo_corso: Number(costo_corso),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: insertedData, error } = await supabase
        .from('corsi_catalogo')
        .insert([corsoRecord])
        .select()
        .single();

      if (error) {
        console.error('[CorsiCatalogo] Insert error:', error);
        return res.status(500).json({ error: 'Failed to create corso' });
      }

      res.json({ corso: insertedData });

    } catch (error) {
      console.error('[CorsiCatalogo] POST error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/corsi-catalogo/:id - Modifica corso
  app.put("/api/corsi-catalogo/:id", auth, async (req, res) => {
    try {
      // Solo admin può modificare corsi
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo admin può modificare corsi' });
      }

      const { id } = req.params;
      const {
        codice_corso,
        nome_corso,
        descrizione,
        durata_giorni,
        costo_corso
      } = req.body;

      // Verifica se il corso ha date programmate
      const { data: dateEsistenti, error: checkError } = await supabase
        .from('corsi_date')
        .select('id')
        .eq('corso_id', id)
        .limit(1);

      if (checkError) {
        console.error('[CorsiCatalogo] Check dates error:', checkError);
        return res.status(500).json({ error: 'Database query failed' });
      }

      // Se ci sono date, non permettere modifica durata
      if (dateEsistenti && dateEsistenti.length > 0 && durata_giorni) {
        return res.status(400).json({ 
          error: 'Non è possibile modificare la durata se ci sono date programmate' 
        });
      }

      // Prepara aggiornamenti
      const updates = {
        updated_at: new Date().toISOString()
      };

      if (codice_corso !== undefined) updates.codice_corso = codice_corso;
      if (nome_corso !== undefined) updates.nome_corso = nome_corso;
      if (descrizione !== undefined) updates.descrizione = descrizione;
      if (durata_giorni !== undefined) updates.durata_giorni = Number(durata_giorni);
      if (costo_corso !== undefined) updates.costo_corso = Number(costo_corso);

      const { data: updatedData, error } = await supabase
        .from('corsi_catalogo')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[CorsiCatalogo] Update error:', error);
        return res.status(500).json({ error: 'Failed to update corso' });
      }

      if (!updatedData) {
        return res.status(404).json({ error: 'Corso non trovato' });
      }

      res.json({ corso: updatedData });

    } catch (error) {
      console.error('[CorsiCatalogo] PUT error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/corsi-catalogo/:id - Ottieni singolo corso
  app.get("/api/corsi-catalogo/:id", auth, async (req, res) => {
    try {
      const { id } = req.params;

      const { data, error } = await supabase
        .from('corsi_catalogo')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('[CorsiCatalogo] Get by ID error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Corso non trovato' });
      }

      res.json({ corso: data });

    } catch (error) {
      console.error('[CorsiCatalogo] GET by ID error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  app.delete("/api/corsi-catalogo/:id", auth, async (req, res) => {
    try {
      // Solo admin può eliminare corsi
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo admin può eliminare corsi' });
      }

      const { id } = req.params;

      // Verifica se il corso ha iscrizioni
      const { data: iscrizioni, error: checkError } = await supabase
        .from('corsi_iscrizioni')
        .select('id')
        .eq('corso_data_id', id)
        .limit(1);

      if (checkError) {
        console.error('[CorsiCatalogo] Check enrollments error:', checkError);
        return res.status(500).json({ error: 'Database query failed' });
      }

      if (iscrizioni && iscrizioni.length > 0) {
        return res.status(400).json({ 
          error: 'Non è possibile eliminare un corso con iscrizioni' 
        });
      }

      const { error } = await supabase
        .from('corsi_catalogo')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[CorsiCatalogo] Delete error:', error);
        return res.status(500).json({ error: 'Failed to delete corso' });
      }

      res.json({ success: true });

    } catch (error) {
      console.error('[CorsiCatalogo] DELETE error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== CORSI DATE =====

  // GET /api/corsi-date - Lista date per corso
  app.get("/api/corsi-date", auth, async (req, res) => {
    try {
      const { corso_id } = req.query || {};

      let query = supabase
        .from('corsi_date')
        .select(`
          *,
          corsi_catalogo!inner(nome_corso, durata_giorni, codice_corso, costo_corso)
        `)
        .order('data_inizio', { ascending: true });

      if (corso_id) {
        query = query.eq('corso_id', corso_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[CorsiDate] Query error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      res.json({ date: data || [] });

    } catch (error) {
      console.error('[CorsiDate] GET error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/corsi-date - Crea nuova data corso
  app.post("/api/corsi-date", auth, async (req, res) => {
    try {
      // Solo admin può creare date corsi
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Solo admin può creare date corsi' });
      }

      const {
        corso_id,
        data_inizio,
        giorni_dettaglio
      } = req.body;

      // Validazione campi obbligatori
      if (!corso_id || !data_inizio || !giorni_dettaglio) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti' });
      }

      // Validazione giorni_dettaglio
      if (!Array.isArray(giorni_dettaglio) || giorni_dettaglio.length === 0) {
        return res.status(400).json({ error: 'Dettagli giorni non validi' });
      }

      // Genera ID univoco
      const id = 'data_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

      // Prepara dati per inserimento
      const dataRecord = {
        id,
        corso_id,
        data_inizio,
        giorni_dettaglio,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: insertedData, error } = await supabase
        .from('corsi_date')
        .insert([dataRecord])
        .select(`
          *,
          corsi_catalogo!inner(nome_corso, durata_giorni)
        `)
        .single();

      if (error) {
        console.error('[CorsiDate] Insert error:', error);
        return res.status(500).json({ error: 'Failed to create corso date' });
      }

      res.json({ data: insertedData });

    } catch (error) {
      console.error('[CorsiDate] POST error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== CORSI ISCRIZIONI =====

  // GET /api/corsi-iscrizioni - Lista iscrizioni con filtri
  app.get("/api/corsi-iscrizioni", auth, async (req, res) => {
    try {
      const { from, to, corso_nome, consulente_id } = req.query || {};
      const isAdmin = (req.user.role === "admin");

      // Costruisci query base con JOIN
      let query = supabase
        .from('corsi_iscrizioni')
        .select(`
          *,
          corsi_date:corso_data_id(
            data_inizio,
            corsi_catalogo:corso_id(nome_corso)
          )
        `)
        .order('created_at', { ascending: true });

      // Filtro consulente
      if (!isAdmin && consulente_id) {
        query = query.eq('consulente_id', consulente_id);
      } else if (isAdmin && consulente_id) {
        query = query.eq('consulente_id', consulente_id);
      } else if (!isAdmin) {
        // Consultant vede solo i propri clienti
        query = query.eq('consulente_id', req.user.id);
      }

      // Filtro periodo - applicato dopo il fetch per evitare problemi con JOIN
      // (i filtri sui JOIN non funzionano sempre bene con Supabase)

      const { data, error } = await query;

      if (error) {
        console.error('[CorsiIscrizioni] Query error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      // Filtra per periodo se specificato
      let filteredData = data || [];
      if (from && to) {
        filteredData = filteredData.filter(iscrizione => {
          const dataCorso = iscrizione.corsi_date?.data_inizio;
          return dataCorso && dataCorso >= from && dataCorso <= to;
        });
      }

      // Aggrega per data corso
      const aggregated = {};
      filteredData.forEach(iscrizione => {
        const dataCorso = iscrizione.corsi_date.data_inizio;
        const nomeCorso = iscrizione.corsi_date.corsi_catalogo.nome_corso;
        const key = `${dataCorso}_${nomeCorso}`;

        if (!aggregated[key]) {
          aggregated[key] = {
            data_corso: dataCorso,
            nome_corso: nomeCorso,
            clienti_iscritti: [],
            totale_iscritti: 0,
            vsd_totale: 0
          };
        }

        aggregated[key].clienti_iscritti.push(iscrizione.cliente_nome);
        aggregated[key].totale_iscritti += 1;
        // Assicurati che vsd_totale sia sempre un numero valido
        const costoPersonalizzato = Number(iscrizione.costo_personalizzato) || 0;
        aggregated[key].vsd_totale = (aggregated[key].vsd_totale || 0) + costoPersonalizzato;
      });

      // Converti in array e ordina per data
      const result = Object.values(aggregated).sort((a, b) => 
        new Date(a.data_corso) - new Date(b.data_corso)
      );

      res.json({ iscrizioni: result });

    } catch (error) {
      console.error('[CorsiIscrizioni] GET error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/corsi-iscrizioni - Crea nuova iscrizione
  app.post("/api/corsi-iscrizioni", auth, async (req, res) => {
    try {
      const {
        corso_data_id,
        clienti
      } = req.body;

      // Validazione campi obbligatori
      if (!corso_data_id || !clienti || !Array.isArray(clienti)) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti' });
      }

      // Prepara iscrizioni per inserimento
      const iscrizioni = clienti.map(cliente => {
        const id = 'iscr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        return {
          id,
          corso_data_id,
          cliente_id: cliente.cliente_id,
          cliente_nome: cliente.cliente_nome,
          consulente_id: cliente.consulente_id,
          consulente_nome: cliente.consulente_nome,
          costo_personalizzato: Number(cliente.costo_personalizzato),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      const { data: insertedData, error } = await supabase
        .from('corsi_iscrizioni')
        .insert(iscrizioni)
        .select();

      if (error) {
        console.error('[CorsiIscrizioni] Insert error:', error);
        return res.status(500).json({ error: 'Failed to create enrollments' });
      }

      res.json({ iscrizioni: insertedData });

    } catch (error) {
      console.error('[CorsiIscrizioni] POST error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/corsi-consulenti - Lista consulenti per filtri
  app.get("/api/corsi-consulenti", auth, async (req, res) => {
    try {
      const isAdmin = (req.user.role === "admin");

      let query = supabase
        .from('app_users')
        .select('id, name')
        .eq('role', 'consultant')
        .order('name', { ascending: true });

      const { data, error } = await query;

      if (error) {
        console.error('[CorsiConsulenti] Query error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      res.json({ consulenti: data || [] });

    } catch (error) {
      console.error('[CorsiConsulenti] GET error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  app.get("/api/corsi-date-disponibili", auth, async (req, res) => {
    try {
      const { corso_id } = req.query || {};

      if (!corso_id) {
        return res.status(400).json({ error: 'corso_id obbligatorio' });
      }

      const oggi = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('corsi_date')
        .select(`
          id,
          data_inizio,
          giorni_dettaglio,
          corsi_catalogo!inner(nome_corso, durata_giorni)
        `)
        .eq('corso_id', corso_id)
        .gte('data_inizio', oggi)
        .order('data_inizio', { ascending: true });

      if (error) {
        console.error('[CorsiDateDisponibili] Query error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      res.json({ date: data || [] });

    } catch (error) {
      console.error('[CorsiDateDisponibili] GET error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

};
