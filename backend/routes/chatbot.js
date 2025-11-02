/**
 * Chatbot AI Route
 * Gestisce le richieste del chatbot con integrazione OpenAI e accesso ai dati Supabase
 */

const { auth } = require('../services/auth');
const { supabase } = require('../lib/storage-supabase');
const OpenAI = require('openai');
const logger = require('../lib/logger');

let openai = null;

// Inizializza OpenAI se la chiave è configurata
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} else {
  logger.warn('OPENAI_API_KEY not configured - Chatbot will not work');
}

module.exports = function(app) {
  
  /**
   * GET /api/chatbot/health - Verifica stato del chatbot
   */
  app.get('/api/chatbot/health', auth, (req, res) => {
    res.json({
      enabled: !!openai,
      hasApiKey: !!process.env.OPENAI_API_KEY,
      supabaseConnected: !!supabase
    });
  });

  /**
   * POST /api/chatbot/query - Processa una query del chatbot
   */
  app.post('/api/chatbot/query', auth, async (req, res) => {
    if (!openai) {
      return res.status(503).json({ 
        error: 'Chatbot non disponibile: OPENAI_API_KEY non configurata' 
      });
    }

    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Messaggio richiesto' });
    }

    try {
      // Determina quali dati del database potrebbero essere rilevanti
      const relevantData = await gatherRelevantData(message, req.user);

      // Costruisci il contesto per il sistema
      const systemPrompt = buildSystemPrompt(req.user);
      const dataContext = formatDataContext(relevantData);

      // Prepara i messaggi per OpenAI
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `${dataContext}\n\nDomanda dell'utente: ${message}`
        },
        ...conversationHistory.slice(-10) // Limita a ultimi 10 messaggi
      ];

      // Chiama OpenAI
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      });

      const response = completion.choices[0]?.message?.content || 'Mi dispiace, non sono riuscito a generare una risposta.';

      logger.info(`[Chatbot] Query processed for user ${req.user.id}`);

      res.json({
        response: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('[Chatbot] Error processing query:', error);
      res.status(500).json({ 
        error: 'Errore durante l\'elaborazione della richiesta',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  /**
   * Raccoglie dati rilevanti dal database in base alla query
   */
  async function gatherRelevantData(message, user) {
    const data = {
      appointments: null,
      clients: null,
      periods: null,
      leads: null,
      corsi: null,
      vendite: null
    };

    const lowerMessage = message.toLowerCase();
    const isAdmin = user.role === 'admin';
    
    // Determina se la query richiede dati di tutti i consulenti o uno specifico
    const wantsAllConsultants = isAdmin && (
      lowerMessage.includes('tutti') || 
      lowerMessage.includes('squadra') || 
      lowerMessage.includes('global') ||
      lowerMessage.includes('team')
    );
    
    // Estrae nome consulente se specificato (solo per admin)
    let specificConsultantId = null;
    if (isAdmin && !wantsAllConsultants) {
      // Cerca nomi di consulenti nel messaggio
      // TODO: potrebbe essere migliorato con una query alla tabella users
      // Per ora assumiamo che se non dice "tutti" allora vuole i suoi dati
    }

    try {
      // Query per appuntamenti (se menzionati)
      if (lowerMessage.includes('appuntamento') || 
          lowerMessage.includes('incontro') || 
          lowerMessage.includes('riunione') ||
          lowerMessage.includes('prossim') ||
          lowerMessage.includes('oggi') ||
          lowerMessage.includes('domani')) {
        
        // Determina filtro data: se dice "prossimi", "domani", "oggi" -> solo futuri
        const wantsFuture = lowerMessage.includes('prossim') || 
                           lowerMessage.includes('domani') || 
                           lowerMessage.includes('oggi') ||
                           lowerMessage.includes('futur');
        
        // Calcola data minima (oggi a mezzanotte)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();
        
        let query = supabase
          .from('appointments')
          .select('id, client, start_time, type, vss, nncf, userid')
          .limit(50);
        
        // Filtro per consulente
        if (!isAdmin || !wantsAllConsultants) {
          query = query.eq('userid', user.id);
        }
        
        // Filtro per data futura se richiesto
        if (wantsFuture) {
          query = query.gte('start_time', todayISO);
        }
        
        // Ordina per data: ascending per prossimi, descending per storici
        query = query.order('start_time', { ascending: wantsFuture });
        
        const { data: appointments } = await query;
        data.appointments = appointments || [];
      }

      // Query per clienti
      if (lowerMessage.includes('cliente') || 
          lowerMessage.includes('client') ||
          lowerMessage.includes('azienda')) {
        
        let query = supabase
          .from('clients')
          .select('id, name, status, consultantid, consultantname')
          .limit(100);
        
        // Filtro per consulente
        if (!isAdmin || !wantsAllConsultants) {
          query = query.eq('consultantid', user.id);
        }
        
        const { data: clients } = await query;
        data.clients = clients || [];
      }

      // Query per periodi/KPI
      if (lowerMessage.includes('periodo') || 
          lowerMessage.includes('kpi') ||
          lowerMessage.includes('indicatore') ||
          lowerMessage.includes('vendita') ||
          lowerMessage.includes('obiettivo') ||
          lowerMessage.includes('target')) {
        
        let query = supabase
          .from('periods')
          .select('*')
          .order('createdat', { ascending: false })
          .limit(50);
        
        // Filtro per consulente
        if (!isAdmin || !wantsAllConsultants) {
          query = query.eq('userid', user.id);
        }
        
        const { data: periods } = await query;
        data.periods = periods || [];
      }

      // Query per leads
      if (lowerMessage.includes('lead') || 
          lowerMessage.includes('prospect')) {
        
        let query = supabase
          .from('leads')
          .select('*')
          .limit(50);
        
        // Filtro per consulente
        if (!isAdmin || !wantsAllConsultants) {
          query = query.eq('consulente_assegnato', user.id);
        }
        
        const { data: leads } = await query;
        data.leads = leads || [];
      }

      // Query per corsi
      if (lowerMessage.includes('corso') || 
          lowerMessage.includes('iscrizion')) {
        
        const { data: corsi } = await supabase
          .from('corsi_catalogo')
          .select(`
            *,
            corsi_date(*),
            corsi_iscrizioni(*)
          `)
          .limit(20);
        
        data.corsi = corsi || [];
      }

      // Query per vendite/riordini
      if (lowerMessage.includes('vendita') || 
          lowerMessage.includes('riordino') ||
          lowerMessage.includes('gi') ||
          lowerMessage.includes('fatturato')) {
        
        let query = supabase
          .from('vendite_riordini')
          .select('*')
          .limit(50);
        
        // Filtro per consulente
        if (!isAdmin || !wantsAllConsultants) {
          query = query.eq('consultantid', user.id);
        }
        
        const { data: vendite } = await query;
        data.vendite = vendite || [];

        // Query anche per GI
        let giQuery = supabase
          .from('gi')
          .select('*')
          .limit(50);
        
        // Filtro per consulente
        if (!isAdmin || !wantsAllConsultants) {
          giQuery = giQuery.eq('consultantid', user.id);
        }
        
        const { data: gi } = await giQuery;
        data.gi = gi || [];
      }

    } catch (error) {
      logger.error('[Chatbot] Error gathering relevant data:', error);
    }

    return data;
  }

  /**
   * Costruisce il prompt di sistema per il chatbot
   */
  function buildSystemPrompt(user) {
    const isAdmin = user.role === 'admin';
    const roleContext = isAdmin 
      ? 'Sei un assistente AI per un sistema di gestione commerciale. L\'utente è un amministratore. Di default, quando non specificato diversamente, mostra solo i dati dell\'utente corrente. Se l\'utente chiede esplicitamente dati di "tutti", "squadra", "team" o "global", puoi mostrare dati aggregati o di tutti i consulenti.'
      : `Sei un assistente AI per un consulente commerciale. L'utente è ${user.name || user.email}. Puoi accedere SOLO ai dati di questo consulente, non hai accesso ai dati di altri consulenti.`;

    return `${roleContext}

Il sistema gestisce:
- Appuntamenti: incontri con clienti, con tipo (vendita, mezza, full, ecc.), VSS, VSD, NNCF
- Clienti: database clienti con status (active, prospect, ecc.)
- Periodi/KPI: Battle Plan con indicatori previsionali e consuntivi (settimanali, mensili, trimestrali, semestrali, annuali)
- Leads: prospetti commerciali
- Corsi: catalogo corsi interaziendali con date e iscrizioni
- Vendite/Riordini: proposte e conferme di vendita
- GI: Gestione Incassi

RISPOSTE:
- Sii preciso e basato sui dati forniti
- Se non hai dati sufficienti, indica cosa manca
- Usa numeri e date specifiche quando disponibili
- Formatta le date in italiano (es. 15 gennaio 2025)
- Per importi, usa formato euro (€ 1.234,56)
- Sii professionale ma amichevole
- Se la domanda è ambigua, chiedi chiarimenti
- Non inventare dati che non sono stati forniti
- Focalizzati su analisi e insights utili per il lavoro commerciale
${isAdmin ? '- Se l\'utente è admin e chiede dati "tutti" o "squadra", usa i dati aggregati forniti. Altrimenti mostra solo i suoi dati.' : '- Mostra SOLO i dati del consulente corrente, non hai accesso ad altri consulenti.'}

RISPOSTE IN ITALIANO.`;
  }

  /**
   * Formatta i dati per il contesto del chatbot
   */
  function formatDataContext(data) {
    let context = 'Dati disponibili dal database:\n\n';

    if (data.appointments && data.appointments.length > 0) {
      context += `APPUNTAMENTI (${data.appointments.length}):\n`;
      data.appointments.slice(0, 20).forEach(apt => {
        const date = new Date(apt.start_time);
        const dateStr = date.toLocaleDateString('it-IT', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
        const timeStr = date.toLocaleTimeString('it-IT', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        context += `- ${apt.client} il ${dateStr} alle ${timeStr}, tipo: ${apt.type}, VSS: €${apt.vss || 0}${apt.nncf ? ', NNCF: Sì' : ''}\n`;
      });
      context += '\n';
    }

    if (data.clients && data.clients.length > 0) {
      context += `CLIENTI (${data.clients.length}):\n`;
      data.clients.slice(0, 15).forEach(client => {
        context += `- ${client.name} (${client.status})\n`;
      });
      context += '\n';
    }

    if (data.periods && data.periods.length > 0) {
      context += `PERIODI/KPI (${data.periods.length}):\n`;
      data.periods.slice(0, 10).forEach(period => {
        const typeLabels = {
          weekly: 'settimanale',
          monthly: 'mensile',
          quarterly: 'trimestrale',
          semiannual: 'semestrale',
          annual: 'annuale'
        };
        const type = typeLabels[period.type] || period.type;
        context += `- ${type} ${period.year || ''} W${period.week || ''} M${period.month || ''} Q${period.quarter || ''}\n`;
      });
      context += '\n';
    }

    if (data.leads && data.leads.length > 0) {
      context += `LEADS (${data.leads.length}):\n`;
      data.leads.slice(0, 10).forEach(lead => {
        context += `- ${lead.nome_lead}${lead.azienda_lead ? ` (${lead.azienda_lead})` : ''}, stato: ${lead.contatto_avvenuto ? 'contattato' : 'da contattare'}\n`;
      });
      context += '\n';
    }

    if (data.vendite && data.vendite.length > 0) {
      context += `VENDITE/RIORDINI (${data.vendite.length}):\n`;
      data.vendite.slice(0, 10).forEach(v => {
        context += `- ${v.cliente}: €${v.valore_proposto || 0} (${v.stato})\n`;
      });
      context += '\n';
    }

    if (data.corsi && data.corsi.length > 0) {
      context += `CORSI (${data.corsi.length}):\n`;
      data.corsi.slice(0, 10).forEach(corso => {
        context += `- ${corso.nome_corso}, costo: €${corso.costo_corso || 0}\n`;
      });
      context += '\n';
    }

    if (context === 'Dati disponibili dal database:\n\n') {
      context += 'Nessun dato specifico disponibile per questa query.\n';
    }

    return context;
  }
};

