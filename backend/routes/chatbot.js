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
      // Analizza anche il contesto della conversazione per capire il tema della domanda
      // Utile per domande di follow-up che non contengono keyword esplicite
      const conversationContext = conversationHistory
        .slice(-10) // Ultimi 10 messaggi di contesto (più ampio)
        .map(m => {
          // Gestisci sia stringhe che oggetti con role/content
          if (typeof m === 'string') return m;
          if (m.role === 'user' && m.content) return m.content;
          if (m.role === 'assistant' && m.content) return m.content;
          return '';
        })
        .filter(m => m.trim().length > 0)
        .join(' ');
      
      // Combina il messaggio corrente con il contesto per recuperare dati rilevanti
      // Questo permette di ricaricare dati anche per domande di follow-up come "SICURO?", "IN CHE SENSO?", ecc.
      const contextForData = `${message} ${conversationContext}`.toLowerCase();
      
      // Determina quali dati del database potrebbero essere rilevanti
      const relevantData = await gatherRelevantData(contextForData, req.user, conversationContext);

      // Estrai mese/anno da TUTTA la conversazione (non solo dall'ultimo messaggio)
      // Questo è fondamentale per mantenere il contesto tra le domande
      const fullConversationText = `${message} ${conversationContext}`;
      const { targetMonth, targetYear } = extractMonthYear(fullConversationText);

      // Definisci monthNames per formattazione
      const monthNames = {
        'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
        'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
      };

      // Costruisci il contesto per il sistema
      const systemPrompt = buildSystemPrompt(req.user);
      const dataContext = formatDataContext(relevantData, message, targetMonth, targetYear, monthNames, req.user);

      // Prepara i messaggi per OpenAI con struttura corretta
      // IMPORTANTE: Includiamo TUTTA la conversazione per mantenere il contesto
      const messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        // Aggiungi la storia della conversazione (ultimi 15 scambi per mantenere più contesto)
        ...conversationHistory.slice(-30).map(msg => {
          // Normalizza formato messaggi (supporta sia oggetti che stringhe)
          if (typeof msg === 'string') {
            // Se è una stringa, cerca di capire se è user o assistant dal contesto
            return { role: 'user', content: msg };
          }
          if (msg.role && msg.content) {
            return { role: msg.role, content: msg.content };
          }
          return null;
        }).filter(Boolean),
        // Aggiungi il messaggio corrente con i dati del database
        {
          role: 'user',
          content: `${dataContext}\n\nDomanda dell'utente: ${message}`
        }
      ];

      // Chiama OpenAI con parametri ottimizzati per analisi approfondite
      // Usa gpt-4o-mini per ridurre i costi mantenendo ottime prestazioni
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.3, // Più deterministico per analisi dati accurate
        max_tokens: 2500, // Più spazio per risposte dettagliate e analisi approfondite
        top_p: 0.95
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
   * Helper: Estrae mese e anno dalla query (può includere conversazione completa)
   * Questo è fondamentale per mantenere il contesto tra domande successive
   * GESTISCE DATE RELATIVE: ieri, domani, questo mese, mese scorso, ecc.
   */
  function extractMonthYear(message) {
    // Se message è un array o oggetto, estrai il testo
    let textToAnalyze = message;
    if (typeof message === 'object' && message !== null) {
      if (Array.isArray(message)) {
        textToAnalyze = message.map(m => {
          if (typeof m === 'string') return m;
          if (m.content) return m.content;
          if (m.role === 'user' || m.role === 'assistant') return m.content || '';
          return '';
        }).join(' ');
      } else if (message.content) {
        textToAnalyze = message.content;
      } else {
        textToAnalyze = JSON.stringify(message);
      }
    }
    
    const lowerMessage = typeof textToAnalyze === 'string' ? textToAnalyze.toLowerCase() : String(textToAnalyze).toLowerCase();
    const monthNames = {
      'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
      'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
    };
    
    const now = new Date();
    let targetMonth = null;
    let targetYear = now.getFullYear();
    
    // PRIORITÀ 1: Cerca prima mesi espliciti nel testo (hanno priorità su "questo mese")
    // Verifica se c'è un mese esplicito menzionato
    let explicitMonthFound = false;
    for (const [name, num] of Object.entries(monthNames)) {
      if (lowerMessage.includes(name)) {
        targetMonth = num;
        explicitMonthFound = true;
        break;
      }
    }
    
    // Cerca anche anni espliciti
    const yearMatch = lowerMessage.match(/\b(20\d{2})\b|\b(\d{2})\b/);
    if (yearMatch) {
      const fullYear = yearMatch[1];
      const shortYear = yearMatch[2];
      if (fullYear) {
        targetYear = parseInt(fullYear);
      } else if (shortYear) {
        const yearNum = parseInt(shortYear);
        targetYear = yearNum <= 50 ? 2000 + yearNum : 1900 + yearNum;
      }
    }
    
    // Se c'è un mese esplicito, usalo e termina
    if (explicitMonthFound) {
      return { targetMonth, targetYear };
    }
    
    // PRIORITÀ 2: Cerca pattern numerici per mese (es. "mese 11", "novembre 25")
    const monthMatch = lowerMessage.match(/(?:mese|month)\s+(\d+)|(\d+)\s+(?:novembre|ottobre|dicembre|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre)/i);
    if (monthMatch) {
      const monthNum = parseInt(monthMatch[1] || monthMatch[2]);
      if (monthNum >= 1 && monthNum <= 12) {
        targetMonth = monthNum;
        return { targetMonth, targetYear };
      }
    }
    
    // PRIORITÀ 3: Gestisci date relative SOLO se non ci sono mesi espliciti
    // "questo mese", "mese corrente", "attuale"
    if (lowerMessage.includes('questo mese') || lowerMessage.includes('mese corrente') || 
        lowerMessage.includes('mese attuale') || lowerMessage.includes('current month')) {
      targetMonth = now.getMonth() + 1;
      targetYear = now.getFullYear();
      return { targetMonth, targetYear };
    }
    
    // "mese scorso", "ultimo mese"
    if (lowerMessage.includes('mese scorso') || lowerMessage.includes('ultimo mese') || 
        lowerMessage.includes('mese precedente')) {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      targetMonth = lastMonth.getMonth() + 1;
      targetYear = lastMonth.getFullYear();
      return { targetMonth, targetYear };
    }
    
    return { targetMonth, targetYear };
  }

  /**
   * Helper: Determina se la query richiede dati di tutti i consulenti
   * IMPORTANTE: Non deve triggerare su domande personali (es. "quanti appuntamenti HO")
   */
  function wantsAllConsultants(message, isAdmin) {
    if (!isAdmin) return false;
    const lowerMessage = message.toLowerCase();
    
    // Controlla prima se è una domanda personale (es. "ho", "mio", "miei")
    const isPersonalQuestion = /\b(ho|hai|hanno|mio|mia|miei|mie|mio)\b/.test(lowerMessage) &&
                               (lowerMessage.includes('appuntamento') || lowerMessage.includes('cliente') || lowerMessage.includes('vendit'));
    
    // Se è una domanda personale, NON vuole vedere tutti (tranne se esplicitamente richiesto)
    if (isPersonalQuestion && !lowerMessage.includes('tutti') && !lowerMessage.includes('squadra')) {
      return false;
    }
    
    // Keyword esplicite per vedere tutti
    return lowerMessage.includes('tutti') || 
           lowerMessage.includes('squadra') || 
           lowerMessage.includes('global') ||
           lowerMessage.includes('team') ||
           lowerMessage.includes('chi non ha') ||
           lowerMessage.includes('chi ha fatto') ||
           lowerMessage.includes('chi ha compilato') ||
           lowerMessage.includes('chi compilato') ||
           lowerMessage.includes('chi manca') ||
           lowerMessage.includes('manca il bp') ||
           lowerMessage.includes('non hanno fatto') ||
           // "chi ha" solo se NON è seguito da "ho" (domanda personale)
           (lowerMessage.includes('chi ha') && !lowerMessage.includes('chi ha ho') && !isPersonalQuestion);
  }

  /**
   * Helper: Carica appuntamenti rilevanti
   * GESTISCE DATE RELATIVE: ieri, oggi, domani, questa settimana, questo mese
   */
  async function loadAppointments(lowerMessage, user, isAdmin, wantsAll, targetMonth, targetYear) {
    const needsAppointments = lowerMessage.includes('appuntamento') || 
        lowerMessage.includes('incontro') || 
        lowerMessage.includes('riunione') ||
        lowerMessage.includes('prossim') ||
        lowerMessage.includes('oggi') ||
        lowerMessage.includes('domani') ||
        lowerMessage.includes('ieri') ||
        lowerMessage.includes('settimana') ||
        lowerMessage.includes('slot') ||
        lowerMessage.includes('disponibil') ||
        lowerMessage.includes('giornate libere') ||
        lowerMessage.includes('giorni liberi') ||
        lowerMessage.includes('liber') ||
        lowerMessage.includes('cosa è successo') ||
        lowerMessage.includes('succede') ||
        targetMonth !== null;
    
    if (!needsAppointments) return null;
    
    const wantsToday = lowerMessage.includes('oggi');
    const wantsTomorrow = lowerMessage.includes('domani');
    const wantsYesterday = lowerMessage.includes('ieri');
    const wantsThisWeek = lowerMessage.includes('settimana') || lowerMessage.includes('questa settimana');
    const wantsFuture = lowerMessage.includes('prossim') || 
                       wantsTomorrow || 
                       wantsToday ||
                       wantsThisWeek ||
                       lowerMessage.includes('futur');
    
    let startDate = null;
    let endDate = null;
    
    if (targetMonth !== null) {
      startDate = new Date(targetYear, targetMonth - 1, 1);
      endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
    } else if (wantsYesterday) {
      // Solo ieri
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = new Date(yesterday);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(yesterday);
      endDate.setHours(23, 59, 59, 999);
    } else if (wantsToday) {
      // Solo oggi
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (wantsTomorrow) {
      // Solo domani
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      startDate = new Date(tomorrow);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(tomorrow);
      endDate.setHours(23, 59, 59, 999);
    } else if (wantsThisWeek) {
      // Questa settimana: da lunedì della settimana corrente a domenica
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = domenica, 1 = lunedì, ...
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Se è domenica, vai al lunedì precedente
      startDate = new Date(today);
      startDate.setDate(today.getDate() + diffToMonday);
      startDate.setHours(0, 0, 0, 0);
      
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // Domenica della stessa settimana
      endDate.setHours(23, 59, 59, 999);
    } else if (wantsFuture) {
      // Prossimi appuntamenti (da oggi in poi, senza limite superiore)
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    }
    
    let query = supabase
      .from('appointments')
      .select('id, client, start_time, type, vss, nncf, userid')
      .limit(500);
    
    // Filtra per utente corrente A MENO CHE:
    // 1. L'utente è admin E vuole vedere tutti (wantsAll è true)
    // 2. Si sta chiedendo disponibilità/slot liberi (che richiedono vedere tutti gli utenti)
    const isAskingAvailability = lowerMessage.includes('slot') || lowerMessage.includes('disponibil') || lowerMessage.includes('liber');
    const shouldFilterByUser = !(isAdmin && wantsAll) && !isAskingAvailability;
    
    if (shouldFilterByUser) {
      query = query.eq('userid', user.id);
    }
    
    if (startDate) {
      query = query.gte('start_time', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('start_time', endDate.toISOString());
    } else if (wantsFuture && !targetMonth) {
      query = query.gte('start_time', startDate.toISOString());
    }
    
    query = query.order('start_time', { ascending: wantsFuture || targetMonth !== null });
    
    const { data: appointments } = await query;
    return appointments || [];
  }

  /**
   * Helper: Carica periodi rilevanti
   */
  async function loadPeriods(lowerMessage, user, isAdmin, wantsAll, conversationContext) {
    const isBPFollowUp = lowerMessage.includes('sicuro') || 
                         lowerMessage.includes('conferma') ||
                         lowerMessage.includes('verifica') ||
                         lowerMessage.includes('hai accesso') ||
                         lowerMessage.includes('cosa ti serve') ||
                         lowerMessage.includes('cosa ti blocca') ||
                         lowerMessage.includes('dati') ||
                         lowerMessage.includes('informazioni') ||
                         lowerMessage.includes('risultato') ||
                         lowerMessage.includes('performance');
    
    const mightBeAboutPeriods = lowerMessage.includes('periodo') || 
        lowerMessage.includes('kpi') ||
        lowerMessage.includes('indicatore') ||
        lowerMessage.includes('vendita') ||
        lowerMessage.includes('obiettivo') ||
        lowerMessage.includes('target') ||
        lowerMessage.includes('bp') ||
        lowerMessage.includes('battle plan') ||
        lowerMessage.includes('previsionale') ||
        lowerMessage.includes('consuntivo') ||
        lowerMessage.includes('chi non ha') ||
        lowerMessage.includes('chi ha fatto') ||
        lowerMessage.includes('chi ha compilato') ||
        lowerMessage.includes('chi compilato') ||
        lowerMessage.includes('manca') ||
        lowerMessage.includes('mese') ||
        lowerMessage.includes('mensil') ||
        lowerMessage.includes('settiman') ||
        lowerMessage.includes('trimestr') ||
        lowerMessage.includes('anno') ||
        lowerMessage.includes('annual') ||
        (isBPFollowUp && conversationContext && (conversationContext.includes('bp') || conversationContext.includes('previsionale') || conversationContext.includes('novembre') || conversationContext.includes('compilato') || conversationContext.includes('periodo'))) ||
        (isAdmin && !lowerMessage.includes('cliente') && !lowerMessage.includes('appuntamento') && lowerMessage.trim().length > 5);
    
    if (!mightBeAboutPeriods) return null;
    
    const needsAllPeriods = wantsAll || 
                            lowerMessage.includes('chi non ha') ||
                            lowerMessage.includes('chi ha fatto') ||
                            lowerMessage.includes('chi ha compilato') ||
                            lowerMessage.includes('chi compilato') ||
                            lowerMessage.includes('manca');
    
    let query = supabase
      .from('periods')
      .select('*')
      .order('createdat', { ascending: false })
      .limit(200);
    
    if (!isAdmin || !needsAllPeriods) {
      query = query.eq('userid', user.id);
    }
    
    const { data: periods } = await query;
    return periods || [];
  }

  /**
   * Helper: Carica utenti per periodi
   * IMPORTANTE: Il chatbot vede TUTTI gli utenti come consulenti, indipendentemente dal ruolo nel database
   * Non fa differenza tra admin e consultant - tutti sono trattati come consulenti
   */
  async function loadUsersForPeriods(periods, needsAllPeriods, isAdmin, existingUsers = []) {
    if (!periods || periods.length === 0) return existingUsers;
    
    if (needsAllPeriods && isAdmin) {
      // Se serve la lista completa, carica TUTTI gli utenti (admin e consultant)
      // Il chatbot li tratta tutti come consulenti
      const uniqueUserIds = [...new Set(periods.map(p => p.userid).filter(Boolean))];
      
      if (uniqueUserIds.length > 0) {
        // Carica tutti gli utenti che hanno periodi, indipendentemente dal ruolo
        const { data: usersWithPeriods } = await supabase
          .from('app_users')
          .select('id, name, role')
          .in('id', uniqueUserIds)
          .order('name', { ascending: true });
        
        // Carica TUTTI gli utenti (admin e consultant) per avere la lista completa
        // Il chatbot li vede tutti come consulenti
        const { data: allUsers } = await supabase
          .from('app_users')
          .select('id, name, role')
          .order('name', { ascending: true });
        
        // Combina: utenti con periodi + tutti gli altri utenti
        const allUserMap = new Map();
        
        // Aggiungi tutti gli utenti (admin e consultant sono trattati allo stesso modo)
        (allUsers || []).forEach(u => allUserMap.set(u.id, u));
        
        return Array.from(allUserMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }
      
      // Fallback: se non ci sono periodi ma serve la lista completa, carica TUTTI gli utenti
      const { data: allUsers } = await supabase
        .from('app_users')
        .select('id, name, role')
        .order('name', { ascending: true });
      
      return allUsers || [];
    }
    
    // Per casi non-admin o quando non serve la lista completa: carica solo gli utenti che hanno periodi
    // IMPORTANTE: senza filtrare per ruolo - tutti gli utenti sono trattati come consulenti
    const uniqueUserIds = [...new Set(periods.map(p => p.userid).filter(Boolean))];
    if (uniqueUserIds.length > 0) {
      const { data: users } = await supabase
        .from('app_users')
        .select('id, name, role')
        .in('id', uniqueUserIds);
      
      if (existingUsers && existingUsers.length > 0) {
        const existingIds = new Set(existingUsers.map(u => u.id));
        const newUsers = (users || []).filter(u => !existingIds.has(u.id));
        return [...existingUsers, ...newUsers];
      }
      return users || [];
    }
    
    return existingUsers || [];
  }

   /**
    * Raccoglie dati rilevanti dal database in base alla query E al contesto completo
    * ANALISI COMPLETA: Considera TUTTA la conversazione, non solo l'ultima domanda
    */
   async function gatherRelevantData(message, user, conversationContext = '') {
     const data = {
       appointments: null,
       clients: null,
       periods: null,
       leads: null,
       corsi: null,
       vendite: null,
       users: null,
       cicli: null,
       gi: null
     };

     // COMBINA il messaggio corrente con TUTTO il contesto della conversazione
     // Questo permette di capire il tema anche per domande di follow-up senza keyword esplicite
     const fullContext = `${message} ${conversationContext}`;
     const lowerMessage = fullContext.toLowerCase();
     const isAdmin = user.role === 'admin';
     
     // Analizza TUTTA la conversazione per determinare se vuole dati di tutti i consulenti
     const wantsAll = wantsAllConsultants(fullContext, isAdmin);
     
     // Estrai mese/anno da TUTTA la conversazione (non solo dall'ultimo messaggio)
     const { targetMonth, targetYear } = extractMonthYear(fullContext);

     try {
       
       // Carica appuntamenti
       data.appointments = await loadAppointments(lowerMessage, user, isAdmin, wantsAll, targetMonth, targetYear);
       
       // Se chiede disponibilità/slot, serve anche lista utenti
       // IMPORTANTE: Il chatbot vede TUTTI gli utenti come consulenti, quindi carichiamo tutti
       if ((lowerMessage.includes('slot') || lowerMessage.includes('disponibil') || lowerMessage.includes('liber')) && isAdmin) {
        const { data: users } = await supabase
          .from('app_users')
          .select('id, name, role')
          .order('name', { ascending: true });
        
        data.users = users || [];
      }

      // CHATBOT INTELLIGENTE: Carica clienti per qualsiasi domanda che potrebbe riguardarli
      // Analizza TUTTO il contesto, non solo l'ultimo messaggio
      const mightBeAboutClients = fullContext.includes('cliente') || 
          fullContext.includes('client') ||
          fullContext.includes('azienda') ||
          fullContext.includes('contatto') ||
          fullContext.includes('lead');
      
      if (mightBeAboutClients) {
        
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

      // Carica periodi - analizza TUTTA la conversazione
      // Se la domanda riguarda "chi ha/non ha compilato", serve SEMPRE la lista completa degli utenti
      const needsAllPeriods = wantsAll || 
                               fullContext.toLowerCase().includes('chi non ha') ||
                               fullContext.toLowerCase().includes('chi ha fatto') ||
                               fullContext.toLowerCase().includes('chi ha compilato') ||
                               fullContext.toLowerCase().includes('chi compilato') ||
                               fullContext.toLowerCase().includes('manca') ||
                               fullContext.toLowerCase().includes('bp previsionale') ||
                               fullContext.toLowerCase().includes('bp consuntivo');
      
      data.periods = await loadPeriods(lowerMessage, user, isAdmin, wantsAll, conversationContext);
      
      // Carica utenti per periodi se necessario
      // IMPORTANTE: Se needsAllPeriods è true, carica TUTTI i consulenti (non solo quelli nei periodi)
      if (data.periods) {
        data.users = await loadUsersForPeriods(data.periods, needsAllPeriods, isAdmin, data.users);
      } else if (needsAllPeriods && isAdmin) {
        // Se non ci sono periodi ma serve la lista completa (per domande tipo "chi manca"), 
        // carica TUTTI gli utenti - il chatbot li vede tutti come consulenti
        const { data: users } = await supabase
          .from('app_users')
          .select('id, name, role')
          .order('name', { ascending: true });
        
        data.users = users || [];
      }

      // Query per leads - analizza tutto il contesto
      if (fullContext.toLowerCase().includes('lead') || 
          fullContext.toLowerCase().includes('prospect')) {
        
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

      // Query per corsi - analizza tutto il contesto
      // Riconosce: corso, corsi, iscrizione, iscrizioni, leadership, interaziendali
      const lowerFullContext = fullContext.toLowerCase();
      if (lowerFullContext.includes('corso') || 
          lowerFullContext.includes('corsi') ||
          lowerFullContext.includes('iscrizion') ||
          lowerFullContext.includes('leadership') ||
          lowerFullContext.includes('interaziendal')) {
        
        let corsiQuery = supabase
          .from('corsi_catalogo')
          .select(`
            *,
            corsi_date(*),
            corsi_iscrizioni(*)
          `)
          .limit(100);
        
        const { data: corsi } = await corsiQuery;
        
        // Filtra in memoria per mese/anno se specificato
        if (targetMonth !== null && corsi && corsi.length > 0) {
          const startMonth = new Date(targetYear, targetMonth - 1, 1);
          const endMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59);
          
          const filtered = corsi.filter(corso => {
            // Filtra per date dei corsi o iscrizioni nel mese target
            const hasDateInMonth = corso.corsi_date && corso.corsi_date.some(date => {
              if (!date.data_corso) return false;
              const dateObj = new Date(date.data_corso);
              if (isNaN(dateObj.getTime())) return false;
              return dateObj.getFullYear() === targetYear && dateObj.getMonth() + 1 === targetMonth;
            });
            const hasIscrizioneInMonth = corso.corsi_iscrizioni && corso.corsi_iscrizioni.some(isc => {
              const iscDate = isc.data_iscrizione || isc.created_at;
              if (!iscDate) return false;
              const dateObj = new Date(iscDate);
              if (isNaN(dateObj.getTime())) return false;
              return dateObj.getFullYear() === targetYear && dateObj.getMonth() + 1 === targetMonth;
            });
            return hasDateInMonth || hasIscrizioneInMonth;
          });
          data.corsi = filtered;
        } else {
          data.corsi = corsi || [];
        }
      }

      // Query per Cicli Aperti - analizza tutto il contesto
      // Riconosce: ciclo aperto, cicli aperti, attività aperta, task aperto
      // IMPORTANTE: Non confondere con "ciclo" generico che potrebbe riferirsi ad altro
      const wantsOpenCycles = (lowerFullContext.includes('ciclo aperto') || 
          lowerFullContext.includes('cicli aperti') ||
          lowerFullContext.includes('attività aperta') ||
          lowerFullContext.includes('task aperto') ||
          (lowerFullContext.includes('cicli') && (lowerFullContext.includes('aperto') || lowerFullContext.includes('aperti'))));
      
      if (wantsOpenCycles) {
        
        let cicliQuery = supabase
          .from('open_cycles')
          .select('*')
          .eq('status', 'open')
          .limit(100);
        
        // Filtro per consulente
        if (!isAdmin || !wantsAll) {
          cicliQuery = cicliQuery.eq('consultantid', user.id);
        }
        
        const { data: cicli } = await cicliQuery;
        data.cicli = cicli || [];
      }

      // Query per GI & Scadenzario - analizza tutto il contesto
      // Riconosce: gi, gross income, scadenzario, scadenza, incasso, incassi, rata, rate
      const wantsGI = lowerFullContext.includes('gi') ||
          lowerFullContext.includes('gross income') ||
          lowerFullContext.includes('scadenzario') ||
          lowerFullContext.includes('scadenza') ||
          lowerFullContext.includes('incasso') ||
          lowerFullContext.includes('rata') ||
          lowerFullContext.includes('rate');
      
      if (wantsGI && !lowerFullContext.includes('vendita') && !lowerFullContext.includes('vendite')) {
        // Carica GI solo se NON è già incluso nelle vendite
        let giQuery = supabase
          .from('gi')
          .select('*')
          .limit(200);
        
        // Filtro per consulente
        if (!isAdmin || !wantsAll) {
          giQuery = giQuery.eq('consultantid', user.id);
        }
        
        const { data: gi } = await giQuery;
        
        // Filtra in memoria per mese/anno se specificato
        if (targetMonth !== null && gi && gi.length > 0) {
          const startMonth = new Date(targetYear, targetMonth - 1, 1);
          const endMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59);
          
          const filtered = gi.filter(g => {
            // Controlla date (campo data o date) o schedule per scadenze
            const checkDate = (dateStr) => {
              if (!dateStr) return false;
              const dateObj = new Date(dateStr);
              if (isNaN(dateObj.getTime())) return false;
              return dateObj >= startMonth && dateObj <= endMonth;
            };
            
            // Controlla data principale
            if (checkDate(g.date || g.data)) return true;
            
            // Controlla scadenze nello schedule (JSONB)
            if (g.schedule && Array.isArray(g.schedule)) {
              return g.schedule.some(s => checkDate(s.dueDate || s.due_date));
            }
            
            return false;
          });
          data.gi = filtered;
        } else {
          data.gi = gi || [];
        }
      }

      // Query per vendite/riordini - analizza tutto il contesto
      // Riconosce: vendita, vendite, riordino, riordini, fatturato
      if (lowerFullContext.includes('vendita') || 
          lowerFullContext.includes('vendite') ||
          lowerFullContext.includes('riordino') ||
          lowerFullContext.includes('riordini') ||
          lowerFullContext.includes('fatturato')) {
        
        let venditeQuery = supabase
          .from('vendite_riordini')
          .select('*')
          .limit(200);
        
        // Filtro per consulente
        const wantsAll = wantsAllConsultants(fullContext, isAdmin);
        if (!isAdmin || !wantsAll) {
          venditeQuery = venditeQuery.eq('consultantid', user.id);
        }
        
        const { data: vendite } = await venditeQuery;
        
        // Filtra in memoria per mese/anno se specificato
        if (targetMonth !== null && vendite && vendite.length > 0) {
          const startMonth = new Date(targetYear, targetMonth - 1, 1);
          const endMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59);
          
          const filtered = vendite.filter(v => {
            // Controlla data_vendita o created_at
            const checkDate = (dateStr) => {
              if (!dateStr) return false;
              const dateObj = new Date(dateStr);
              if (isNaN(dateObj.getTime())) return false;
              return dateObj >= startMonth && dateObj <= endMonth;
            };
            
            return checkDate(v.data_vendita) || checkDate(v.created_at);
          });
          data.vendite = filtered;
        } else {
          data.vendite = vendite || [];
        }
      }

    } catch (error) {
      logger.error('[Chatbot] Error gathering relevant data:', error);
    }

    return data;
  }

  /**
   * Costruisce il prompt di sistema per il chatbot
   * RENDE IL CHATBOT UN ANALISTA ESPERTO CON ACCESSO COMPLETO AI DATI
   */
  function buildSystemPrompt(user) {
    const isAdmin = user.role === 'admin';
    const roleContext = isAdmin 
      ? 'Sei un ANALISTA ESPERTO DI DATI commerciali per un sistema di gestione commerciale. L\'utente è un amministratore. HAI ACCESSO COMPLETO a tutti i dati del database (appuntamenti, clienti, periodi, KPI, vendite, corsi, leads). Di default, quando non specificato diversamente, mostra solo i dati dell\'utente corrente. Se l\'utente chiede esplicitamente dati di "tutti", "squadra", "team" o "global", puoi mostrare dati aggregati o di tutti i consulenti.'
      : `Sei un ANALISTA ESPERTO DI DATI commerciali per un consulente commerciale. L'utente è ${user.name || user.email}. HAI ACCESSO COMPLETO ai dati di questo consulente nel database (appuntamenti, clienti, periodi, KPI, vendite, corsi).`;

    return `${roleContext}

=== SEI UN ANALISTA ESPERTO, NON UN CHATBOT GENERICO ===

RUOLO: Sei un ANALISTA ESPERTO DEI DATI di questa applicazione commerciale. Il tuo compito è:
- ANALIZZARE i dati in profondità, non rispondere superficialmente
- INTERPRETARE le domande in modo intelligente basandoti sul CONTESTO COMPLETO della conversazione
- USARE TUTTI i dati disponibili per fornire risposte accurate e dettagliate
- NON "tirare a caso": ogni risposta deve essere basata sui dati reali forniti
- MANTENERE IL CONTESTO tra tutte le domande nella conversazione

IMPORTANTE - TRATTAMENTO UTENTI:
- Il chatbot vede TUTTI gli utenti come CONSULENTI, indipendentemente dal loro ruolo nel database (admin o consultant)
- Quando analizzi "chi ha compilato", "chi manca", "tutti i consulenti", includi TUTTI gli utenti nella lista UTENTI/CONSULENTI
- Non fare distinzione tra admin e consultant - tutti sono consulenti ai fini dell'analisi BP, KPI, periodi, ecc.
- La lista UTENTI/CONSULENTI include sia admin che consultant, tutti trattati allo stesso modo

CONTESTO DELLA CONVERSAZIONE:
- Hai accesso a TUTTA la storia della conversazione precedente
- Quando l'utente fa una domanda di follow-up (es. "E quello?", "E gli altri?", "SICURO?"), usa il CONTESTO precedente per capire a cosa si riferisce
- Se nella conversazione precedente si parlava di "novembre 2025" e l'utente ora chiede "E dicembre?", capisci che si riferisce a "dicembre 2025"
- Se si parlava di "BP previsionale" e ora chiede "E il consuntivo?", capisci il riferimento

ACCESSO AI DATI:
- Hai PIENO ACCESSO al database attraverso i dati forniti nella conversazione
- I dati includono: appointments, clients, periods (con indicatorsprev/indicatorscons), leads, corsi, vendite, cicli aperti, gi/scadenzario, users
- Per ogni domanda, vengono caricati i dati rilevanti dal database
- USA SEMPRE questi dati invece di inventare o supporre
- Se i dati non sono sufficienti, dillo esplicitamente e suggerisci cosa serve
- CICLI APERTI: attività/task aperti con priorità e scadenze
- GI & SCADENZARIO: Gross Income con scadenze e rate di pagamento

=== IMPORTANTE: SEI UN CHATBOT INTELLIGENTE ===

PRIMA DI TUTTO: Studia attentamente il GLOSSARIO qui sotto. Conosci perfettamente tutti i termini e acronimi prima di rispondere a qualsiasi domanda.

NON SEI STUPIDO: Non dipendere da keyword esatte. INTERPRETA le domande in modo intelligente, anche se l'utente usa parole diverse o formula male la domanda.

SE NON SEI SICURO: CHIEDI CHIARIMENTI invece di inventare risposte. È meglio chiedere "Intendi il BP previsionale o consuntivo?" piuttosto che supporre.

INTERPRETAZIONE INTELLIGENTE:
- "Chi ha fatto il BP di novembre?" = "Chi ha compilato il BP previsionale di novembre?"
- "I miei risultati" = potrebbe essere KPI, vendite, GI, o qualsiasi indicatore
- "I prossimi impegni" = appuntamenti futuri
- "Chi manca?" (nel contesto di BP) = "Chi non ha compilato il BP?"
- "La mia squadra" (per admin) = tutti i consulenti

ANALISI CONTESTUALE:
- Se l'utente menziona un mese/nome senza altro contesto, chiedi chiarimenti se necessario
- Se i dati non sono chiari o mancanti, dillo esplicitamente e chiedi se vuole informazioni diverse
- Non dire mai "non ho accesso" se hai i dati - usa i dati che hai e spiega se sono incompleti
- CRITICO: Se una sezione dati è vuota o mostra "Nessuna vendita trovata", "Nessun corso trovato", "APPUNTAMENTI (0 totali)", NON dire "non ho accesso" - dì esplicitamente "Non ho trovato [tipo] per [periodo se specificato]" o "Non ci sono [tipo] registrati per [periodo]"
- USA SEMPRE i dati forniti nelle sezioni qui sotto: se vedi "APPUNTAMENTI (0 totali)" o "VENDITE/RIORDINI: Nessuna vendita trovata per novembre 2025", rispondi basandoti su questi dati reali
- Se una domanda riguarda vendite, corsi, appuntamenti e la sezione corrispondente è vuota o indica "Nessun [tipo] trovato", rispondi con "Non ho trovato [tipo] per [periodo se specificato]" invece di dire "non ho accesso" o "avrei bisogno di accedere"

Il sistema gestisce:
- Appuntamenti: incontri con clienti, con tipo (vendita, mezza, full, ecc.), VSS, VSD, NNCF
- Clienti: database clienti con status (active, prospect, ecc.)
- Periodi/KPI: Battle Plan con indicatori previsionali e consuntivi (settimanali, mensili, trimestrali, semestrali, annuali)
- Leads: prospetti commerciali
- Corsi: catalogo corsi interaziendali con date e iscrizioni
- Vendite/Riordini: proposte e conferme di vendita
- GI: Gestione Incassi

=== GLOSSARIO E GUIDA ALL'USO ===

Devi fungere da GUIDA per l'utilizzo dell'app e conoscere tutti i termini tecnici. Ecco il glossario completo:

**BP (Battle Plan - Piano di Battaglia)**: Il piano di programmazione del consulente. Per ogni settimana/mese/trimestre/ecc. il consulente fa un PREVISIONALE (piano con obiettivi) e al termine deve fare un CONSUNTIVO che verifica i target raggiunti o meno.

**GI (Gross Income - Valore dell'Incassato)**: Valore dell'incassato, importo effettivamente incassato/guadagnato. Commissione: 15% per tutti. Target mensili: Junior €10.000, Senior €15.000.

**VSS (Value Services Sold - Valore dei Servizi Venduti)**: Il venduto, valore monetario delle vendite chiuse. Target mensili: Junior €15.000, Senior €30.000.

**VSD (Value Services Delivered - Valore dei Servizi Erogati)**: 
- **VSDPersonale**: valore dei servizi erogati direttamente dal consulente (attività erogate direttamente). Target mensili: Junior €5.000, Senior €15.000. Commissioni: Junior 20%, Senior 25%.
- **VSDIndiretto**: valore dei servizi interaziendali erogati non direttamente dal consulente (es. corsi in cui il cliente ha usufruito del servizio erogato non direttamente dal consulente). Target mensili: entrambi €5.000.

**NNCF (New Name in Central File - Nuovo Cliente)**: Numero dei nuovi clienti acquisiti e aggiunti al database. Target mensili: Junior 4, Senior 1.

**KPI (Key Performance Indicator)**: Indicatori chiave di performance. Monetari: VSS, VSDPersonale, VSDIndiretto, GI. Conteggio: NNCF, AppFatti, Telefonate.

**Provvigioni** (sinonimo di Commissioni, ma usiamo sempre "Provvigioni"): Calcolate su risultati.
- **ProvvGI**: 15% del GI (per tutti i consulenti, junior e senior)
- **ProvvVSD**: 20% del VSDPersonale per consulenti JUNIOR, 25% del VSDPersonale per consulenti SENIOR
- **IMPORTANTE**: Le provvigioni su VSD si calcolano SOLO su VSDPersonale, NON su VSDIndiretto
- **Totale Provvigioni** = ProvvGI + ProvvVSD
- Per calcolare le provvigioni previste: usa i valori dagli indicatori PREVISIONALI (indicatorsprev)
- Per calcolare le provvigioni consuntive: usa i valori dagli indicatori CONSUNTIVI (indicatorscons)
- Per determinare se un consulente è junior o senior: verifica il campo "grade" dell'utente (se non disponibile, assumi junior)

**Grade (Avanzamento di Carriera)**: Sistema di avanzamento basato su risultati. Un consulente parte da Junior e passa a Senior dopo 3 mesi consecutivi con GI maggiore o uguale a €8.000 (promozione MANUALE, non automatica). Junior: target più bassi, 20% su VSD. Senior: target più alti, 25% su VSD.

**Previsionale**: Piano con obiettivi all'inizio del periodo (indicatorsprev).

**Consuntivo**: Risultati effettivi alla fine del periodo (indicatorscons).

**Status Clienti**: 
- **Attivo**: cliente attivo (diventa così quando NNCF=true)
- **Potenziale**: cliente che prevedi di incontrare e vendere, quindi farlo diventare cliente
- **Lead non chiuso**: l'hai incontrato (era potenziale) ma non ha comprato

**Tipi Appuntamento** (9 tipi):
1. Vendita (90min, VSS+VSD personale+NNCF)
2. Mezza giornata (240min/4h, VSD precompilato €1.000)
3. iProfile (90min, VSD precompilato €700)
4. Giornata intera/Full (570min/9.5h, VSD precompilato €2.000)
5. Formazione (570min/9.5h, VSD indiretto)
6. MBS (570min/9.5h, VSD indiretto)
7. Sottoprodotti (240min/4h, include Telefonate+AppFissati)
8. Riunione (60min, attività interna)
9. Impegni personali (60min, attività personale)

**Tipi Periodo**: Settimanale (1 settimana), Mensile (1 mese), Trimestrale (3 mesi), Semestrale (6 mesi), Annuale (12 mesi), YTD (Year To Date: dal 1 gennaio → fine mese corrente), LTM (Last Twelve Months: ultimi 12 mesi rolling).

**Lead**: Prospetto commerciale con nome, azienda, consulente assegnato, stato contatto.

**Telefonate**: Quante telefonate a freddo per fissare appuntamenti prevedi di fare o hai fatto. Target Junior: 300, Senior: 0.

**AppFissati**: Quanti appuntamenti hai fissato in quella sessione di giornata.

**AppFatti**: Quanti appuntamenti hai fatto in quella giornata. Target Junior: 30, Senior: 4.

**CorsiLeadership**: Quanti clienti hai iscritto a corso leadership. È uno dei corsi interaziendali (non tutti i corsi interaziendali sono leadership).

**iProfile**: Quanti iProfile hai venduto.

**MBS**: Quanti clienti hai iscritto in MBS.

**Sottoprodotti**: Tutto ciò che precede la vendita. I sottoprodotti della vendita: fare appuntamenti, fare telefonate a freddo, fare visite a freddo, fissare appuntamenti, fare outbound mail o messaggi, ecc. È tutto ciò che un commerciale fa e precede la vendita. Tipo appuntamento con durata 4h che include Telefonate e Appuntamenti fissati.

**Target/Obiettivo**: Sinonimi. Obiettivi di performance fissati nel BP previsionale.

**Slot liberi/Disponibilità**: Sinonimi. Indica quando un consulente ha tempo libero per nuovi appuntamenti.

**Leaderboard/Ranking**: Classifica dei consulenti basata su performance (KPI) in un determinato periodo.

**Aggregato**: Dati aggregati di più consulenti (squadra/team). Gli admin possono vedere dati aggregati.

**Bag (Indicators Bag)**: Contenitore che contiene tutti gli indicatori KPI di un periodo (indicatorsprev o indicatorscons).

COME GUIDARE GLI UTENTI:
- Spiega i termini quando chiesti o quando usati in contesto
- Aiuta a capire la differenza tra previsionale e consuntivo
- Spiega i target per junior vs senior
- Guida nella creazione di appuntamenti e BP
- Aiuta a interpretare i KPI e le performance
- Spiega come funzionano le provvigioni

RISPOSTE INTELLIGENTI:
- INTERPRETA la domanda anche se non usa keyword esatte. Se qualcuno chiede "chi ha fatto novembre?" nel contesto di BP, capisci che vuole sapere chi ha compilato il BP previsionale di novembre
- ANALIZZA i dati forniti: confronta, identifica differenze, trova chi manca
- Per domande tipo "chi non ha fatto X", confronta la lista utenti con i dati (es. periodi) e identifica chi manca
- Usa numeri e date specifiche quando disponibili
- Formatta le date in italiano (es. 15 gennaio 2025)
- Per importi, usa formato euro (€ 1.234,56)
- Sii professionale ma amichevole
- SE LA DOMANDA È AMBIGUA O NON HAI DATI CHIARI: CHIEDI CHIARIMENTI invece di inventare o supporre
- SE I DATI SONO VUOTI/MANCANTI: Dì esplicitamente "Non ho trovato [tipo] per [periodo]" invece di dire "non ho accesso" o "non ho dati"
  * Esempio corretto: "Non ho trovato appuntamenti per il 15 ottobre 2025"
  * Esempio corretto: "Non ho trovato vendite per novembre 2025"
  * Esempio corretto: "Non ho trovato corsi registrati per questo mese"
  * Esempio SBAGLIATO: "Non ho accesso ai dati degli appuntamenti"
  * Esempio SBAGLIATO: "Non posso vedere le vendite"
- NON dire mai "non ho accesso" se hai caricato i dati - spiega cosa hai trovato e chiedi se serve altro
- NON inventare dati che non sono stati forniti
- Se una sezione dati è vuota (es. "APPUNTAMENTI: Nessun appuntamento trovato"), è normale e corretto dirlo chiaramente
- Focalizzati su analisi e insights utili per il lavoro commerciale
- Per Battle Plan: un periodo ha "type" (settimanale/mensile/trimestrale/semestrale/annuale - ATTENZIONE: nel database sono in ITALIANO), "year", "month", "week", "quarter", "semester", "indicatorsprev" (previsionale), "indicatorscons" (consuntivo). Quando una domanda chiede "BP di novembre" o "BP mensile", devi cercare SOLO periodi con type="mensile" (non "monthly").
- SE NON SEI SICURO: Esempio: "Non sono sicuro se intendi il previsionale o il consuntivo. Vuoi che ti mostri entrambi?"
- SE I DATI SONO INCOMPLETI: Esempio: "Ho trovato 3 consulenti che hanno compilato il BP di novembre, ma potrebbero essercene altri. Vuoi che verifichi meglio?"

ANALISI COMPARATIVE:
- Quando hai una lista di UTENTI e una lista di PERIODI, confronta:
  * Trova quali userid hanno periodi per un determinato mese/anno/tipo
  * Identifica quali utenti MANCANO confrontando la lista utenti con i periodi presenti
  * Analizza indicatori previsionali vs consuntivi

- Quando l'utente chiede "chi ha previsto più GI", "chi ha più VSS", "chi ha fatto più GI", "classifica", "ranking", ecc.:
  * Cerca nella lista PERIODI i periodi rilevanti (es. novembre 2025 se menzionato nella conversazione)
  * CRITICO: Per classifiche di un MESE, usa SOLO periodi con type="mensile". NON includere periodi settimanali
  * NON SOMMARE MAI periodi settimanali con periodi mensili - i settimanali sono solo lo spaccato del mensile
  * Leggi gli indicatori mostrati nelle righe "Indicatori PREVISIONALE" o "Indicatori CONSUNTIVO"
  * Estrai i valori numerici (es. "GI: €10.000" → valore 10000)
  * Confronta i valori tra tutti i consulenti
  * Elenca i consulenti dal valore più alto al più basso
  * Se nella conversazione precedente si parlava di un mese/anno specifico, usa quello

- Quando l'utente chiede "scostamento", "differenza", "confronto tra previsionale e consuntivo":
  * Cerca i periodi rilevanti (es. novembre 2025 se menzionato)
  * Per ogni periodo che ha ENTRAMBI previsionale E consuntivo compilati, calcola la differenza:
    - Scostamento GI = GI_consuntivo - GI_previsionale
    - Scostamento VSS = VSS_consuntivo - VSS_previsionale
    - Scostamento VSDPersonale = VSDPersonale_consuntivo - VSDPersonale_previsionale
    - Scostamento NNCF = NNCF_consuntivo - NNCF_previsionale
  * Mostra per ogni consulente:
    - Valori previsionali
    - Valori consuntivi
    - Scostamenti (positivo = superato, negativo = mancato)
  * Se un periodo ha solo previsionale o solo consuntivo, dillo esplicitamente
  * Se non ci sono consuntivi per il periodo richiesto, spiega che il consuntivo viene fatto alla fine del periodo

- Quando hai una lista di UTENTI e una lista di APPUNTAMENTI per determinare disponibilità/slot liberi:
  * Conta gli appuntamenti per ogni userid (consulente)
  * Chi ha MENO appuntamenti = ha PIÙ slot liberi/giornate libere
  * Confronta i conteggi e identifica chi ha più disponibilità
  * Se il mese è specificato (es. "novembre"), filtra solo gli appuntamenti di quel mese

${isAdmin ? '- Se l\'utente è admin e chiede "chi non ha fatto", "chi ha fatto", "chi ha compilato", "chi manca", "chi ha più slot liberi", "disponibilità", "tutti", "squadra", "team" o "global", usa i dati aggregati forniti e fai analisi comparative. Per "chi ha compilato il BP" (senza specificare previsionale/consuntivo) si intende SOLO il PREVISIONALE (indicatorsprev non vuoto). CRITICO: USA SEMPRE E SOLO I NOMI DEGLI UTENTI, MAI GLI ID o "UserID: xxx". Se un nome non è disponibile, NON includere quell\'utente nella risposta. NON duplicare mai lo stesso nome nella lista. DISTINGUI SEMPRE tra previsionale (indicatorsprev) e consuntivo (indicatorscons).' : '- Mostra SOLO i dati del consulente corrente, non hai accesso ad altri consulenti. Quando rispondi sui tuoi BP, distingui chiaramente tra previsionale (indicatorsprev) e consuntivo (indicatorscons).'}

RISPOSTE IN ITALIANO.`;
  }

  /**
   * Formatta i dati per il contesto del chatbot
   */
  function formatDataContext(data, message = '', targetMonth = null, targetYear = null, monthNames = null, user = null) {
    let context = 'Dati disponibili dal database:\n\n';
    const lowerMessage = (message || '').toLowerCase();
    
    if (!monthNames) {
      monthNames = {
        'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
        'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
      };
    }
    
    if (!targetYear) {
      targetYear = new Date().getFullYear();
    }
    
    // Crea mappa userid -> nome per sostituire ID con nomi
    // IMPORTANTE: Carica anche gli userid dai periodi se non ci sono già gli utenti
    const userIdToName = {};
    if (data.users && data.users.length > 0) {
      data.users.forEach(u => {
        userIdToName[u.id] = u.name || 'Sconosciuto';
      });
    }
    
    // Se ci sono periodi ma mancano alcuni userid nella mappa, carica quei nomi
    if (data.periods && data.periods.length > 0) {
      const missingUserIds = data.periods
        .map(p => p.userid)
        .filter(uid => uid && !userIdToName[uid]);
      
      if (missingUserIds.length > 0 && supabase) {
        // Non possiamo fare query async qui, ma possiamo aggiungere un warning
        // In alternativa, carichiamo gli utenti nella gatherRelevantData
        missingUserIds.forEach(uid => {
          userIdToName[uid] = `UserID: ${uid} (nome non trovato)`;
        });
      }
    }
    
    // Helper per ottenere nome utente
    function getUserName(userId) {
      if (!userId) return 'Sconosciuto';
      return userIdToName[userId] || `UserID: ${userId}`;
    }

    if (data.appointments && data.appointments.length > 0) {
      context += `APPUNTAMENTI (${data.appointments.length} totali):\n`;
      
      // Se chiede disponibilità/slot, mostra conteggio per consulente
      const lowerContext = (data.appointments[0]?.start_time || '').toLowerCase();
      if (lowerMessage.includes('slot') || lowerMessage.includes('disponibil') || lowerMessage.includes('liber')) {
        // Raggruppa per consulente
        const byConsultant = {};
        data.appointments.forEach(apt => {
          const uid = apt.userid || 'unknown';
          if (!byConsultant[uid]) {
            byConsultant[uid] = { count: 0, appointments: [] };
          }
          byConsultant[uid].count++;
          byConsultant[uid].appointments.push(apt);
        });
        
        context += 'APPUNTAMENTI PER CONSULENTE:\n';
        Object.entries(byConsultant).forEach(([uid, info]) => {
          const userName = getUserName(uid);
          context += `- ${userName}: ${info.count} appuntamenti\n`;
        });
        context += '\n';
        
        // Mostra anche alcuni dettagli
        context += 'Dettagli appuntamenti (primi 30):\n';
        data.appointments.slice(0, 30).forEach(apt => {
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
          const userName = getUserName(apt.userid);
          context += `- ${userName}, ${apt.client} il ${dateStr} alle ${timeStr}, tipo: ${apt.type}\n`;
        });
      } else {
        // Formato normale per altre domande
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
      }
      context += '\n';
    }

    if (data.clients && data.clients.length > 0) {
      const isAdmin = user && user.role === 'admin';
      
      // Se admin e ci sono clienti di più consulenti, raggruppa per consulente
      if (isAdmin) {
        const clientsByConsultant = {};
        data.clients.forEach(client => {
          const consultantId = client.consultantid || client.consultantId || 'senza_consulente';
          const consultantName = client.consultantname || client.consultantName || getUserName(consultantId) || 'Sconosciuto';
          if (!clientsByConsultant[consultantName]) {
            clientsByConsultant[consultantName] = [];
          }
          clientsByConsultant[consultantName].push(client);
        });
        
        const consultantNames = Object.keys(clientsByConsultant).sort();
        if (consultantNames.length > 1) {
          context += `CLIENTI (${data.clients.length} totali, suddivisi per consulente):\n`;
          consultantNames.forEach(consultantName => {
            const clients = clientsByConsultant[consultantName];
            context += `- ${consultantName}: ${clients.length} clienti\n`;
            clients.slice(0, 5).forEach(client => {
              context += `  • ${client.name} (${client.status})\n`;
            });
            if (clients.length > 5) {
              context += `  ... e altri ${clients.length - 5} clienti\n`;
            }
          });
        } else {
          // Un solo consulente, formato normale
          context += `CLIENTI (${data.clients.length}):\n`;
          data.clients.slice(0, 15).forEach(client => {
            context += `- ${client.name} (${client.status})\n`;
          });
        }
      } else {
        // Non admin: formato normale
        context += `CLIENTI (${data.clients.length}):\n`;
        data.clients.slice(0, 15).forEach(client => {
          context += `- ${client.name} (${client.status})\n`;
        });
      }
      context += '\n';
    }

    if (data.periods && data.periods.length > 0) {
      context += 'NOTA CRITICA SULLA FORMATTAZIONE PERIODI:\n';
      context += 'Ogni periodo mostra due stati SEPARATI e INDIPENDENTI:\n';
      context += '- PREVISIONALE: COMPILATO significa che indicatorsprev contiene dati reali (non è vuoto/null)\n';
      context += '- CONSUNTIVO: COMPILATO significa che indicatorscons contiene dati reali (non è vuoto/null)\n';
      context += 'IMPORTANTE: Questi due stati sono INDIPENDENTI. Un periodo può avere:\n';
      context += '  * Solo PREVISIONALE compilato (indicatorsprev pieno, indicatorscons vuoto/null)\n';
      context += '  * Solo CONSUNTIVO compilato (indicatorsprev vuoto/null, indicatorscons pieno)\n';
      context += '  * Entrambi compilati\n';
      context += '  * Nessuno dei due compilati\n';
      context += 'Quando qualcuno chiede "chi ha compilato il BP di [mese]" senza specificare, si riferisce SOLO al PREVISIONALE.\n\n';
      
      context += 'ISTRUZIONE CRITICA SU PERIODI SETTIMANALI E MENSILI:\n';
      context += 'I PERIODI SETTIMANALI NON SI SOMMANO AI MENSILI!\n';
      context += '- Un BP SETTIMANALE è solo lo "SPACCATO" (dettaglio) del BP MENSILE\n';
      context += '- I settimanali sono parte del mensile, NON una somma aggiuntiva\n';
      context += '- Per classifiche o analisi di un MESE: usa SOLO il periodo MENSILE (type="mensile")\n';
      context += '- NON sommare MAI i valori di periodi settimanali con quelli mensili\n';
      context += '- Se per un mese esiste sia un periodo mensile che settimanali, usa SOLO il MENSILE\n';
      context += '- I periodi settimanali servono solo per vedere il dettaglio settimana per settimana\n\n';
      
      // Se specificato mese/anno, evidenzia i periodi corrispondenti
      // IMPORTANTE: Se la domanda riguarda "BP di [mese]", "BP mensile", "classifica", "ranking", filtra SOLO periodi MENSILI
      const lowerMsg = (message || '').toLowerCase();
      const isMonthlyBPQuestion = lowerMsg.includes('bp') || lowerMsg.includes('battle plan') || lowerMsg.includes('previsionale') || lowerMsg.includes('consuntivo');
      const isRankingQuestion = lowerMsg.includes('classifica') || lowerMsg.includes('ranking') || lowerMsg.includes('chi ha più') || lowerMsg.includes('chi ha previsto più');
      const shouldFilterMonthlyOnly = (isMonthlyBPQuestion || isRankingQuestion) && targetMonth;
      
      let relevantPeriods = data.periods;
      if (targetMonth) {
        relevantPeriods = data.periods.filter(p => {
          // Se è una domanda su BP mensili, considera SOLO periodi con type="mensile"
          if (shouldFilterMonthlyOnly && p.type !== 'mensile') {
            return false; // Escludi periodi settimanali, trimestrali, ecc.
          }
          
          // PRIORITÀ 1: Se year E month sono popolati, usa quelli (più preciso)
          if (p.year != null && p.month != null) {
            return p.year == targetYear && p.month == targetMonth;
          }
          
          // PRIORITÀ 2: Se year/month sono NULL, usa startdate (IMPORTANTE: molti periodi hanno year/month NULL!)
          if (p.startdate) {
            try {
              const start = new Date(p.startdate);
              // Verifica che la data sia valida
              if (isNaN(start.getTime())) return false;
              
              const startYear = start.getFullYear();
              const startMonth = start.getMonth() + 1; // getMonth() è 0-based
              
              // Il periodo corrisponde se startDate è nel mese richiesto
              if (startYear == targetYear && startMonth == targetMonth) {
                return true;
              }
              
              // Oppure controlla se startDate/endDate si sovrappone al mese richiesto
              if (p.enddate) {
                const end = new Date(p.enddate);
                if (!isNaN(end.getTime())) {
                  const targetStart = new Date(targetYear, targetMonth - 1, 1);
                  const targetEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59);
                  return start <= targetEnd && end >= targetStart;
                }
              }
            } catch (e) {
              // Ignora errori di parsing
              return false;
            }
          }
          
          // PRIORITÀ 3: Se solo year o month è popolato, usa quello che c'è
          if (p.year != null) {
            if (p.year != targetYear) return false;
            // Se year corrisponde ma month è NULL, controlla startdate se disponibile
            if (p.month == null && p.startdate) {
              try {
                const start = new Date(p.startdate);
                if (!isNaN(start.getTime())) {
                  return start.getMonth() + 1 == targetMonth;
                }
              } catch (e) {}
            }
          }
          
          return false;
        });
      }
      
      context += `PERIODI/KPI/BP (${data.periods.length} totali${relevantPeriods.length !== data.periods.length && targetMonth ? `, ${relevantPeriods.length} rilevanti per ${Object.keys(monthNames).find(k => monthNames[k] === targetMonth)} ${targetYear}` : ''}):\n`;
      
      // Mostra prima i periodi rilevanti, poi tutti gli altri
      // IMPORTANTE: Se è una domanda su BP mensili e abbiamo periodi rilevanti filtrati, usa SOLO quelli
      // NON includere altri periodi che potrebbero confondere l'AI
      let periodsToShow;
      if (shouldFilterMonthlyOnly && relevantPeriods.length > 0) {
        // Per domande su BP mensili, mostra SOLO i periodi mensili rilevanti (già filtrati)
        periodsToShow = relevantPeriods;
      } else if (relevantPeriods.length > 0 && relevantPeriods.length <= 30 && targetMonth) {
        // Per altre domande con mese specificato, mostra rilevanti + altri
        periodsToShow = [...relevantPeriods, ...data.periods.filter(p => !relevantPeriods.find(rp => rp.id === p.id))].slice(0, 50);
      } else {
        // Altrimenti mostra tutti (limitati)
        periodsToShow = data.periods.slice(0, 50);
      }
      
      periodsToShow.forEach(period => {
        // I tipi nel database sono in italiano, non in inglese!
        // Mappa sia da italiano a italiano (per chiarezza) sia da inglese (se presente)
        const typeLabels = {
          'settimanale': 'settimanale',
          'weekly': 'settimanale',
          'mensile': 'mensile',
          'monthly': 'mensile',
          'trimestrale': 'trimestrale',
          'quarterly': 'trimestrale',
          'semestrale': 'semestrale',
          'semiannual': 'semestrale',
          'annuale': 'annuale',
          'annual': 'annuale'
        };
        const type = typeLabels[period.type] || period.type;
        
        // Verifica se previsionale e consuntivo sono realmente compilati
        // Un oggetto può esistere ma essere vuoto {} o avere solo campi null/vuoti
        const hasPrev = period.indicatorsprev && 
                       typeof period.indicatorsprev === 'object' && 
                       !Array.isArray(period.indicatorsprev) &&
                       Object.keys(period.indicatorsprev).length > 0 &&
                       Object.values(period.indicatorsprev).some(v => v !== null && v !== undefined && v !== '');
        
        const hasCons = period.indicatorscons && 
                       typeof period.indicatorscons === 'object' && 
                       !Array.isArray(period.indicatorscons) &&
                       Object.keys(period.indicatorscons).length > 0 &&
                       Object.values(period.indicatorscons).some(v => v !== null && v !== undefined && v !== '');
        
        // Calcola mese/anno da startDate se non sono popolati
        let periodMonth = period.month;
        let periodYear = period.year;
        if (!periodMonth && period.startdate) {
          try {
            const startDate = new Date(period.startdate);
            periodMonth = startDate.getMonth() + 1;
            periodYear = startDate.getFullYear();
          } catch (e) {
            // Ignora errori
          }
        }
        
        const monthName = periodMonth ? new Date(2000, periodMonth - 1).toLocaleString('it-IT', { month: 'long' }) : '';
        const userName = getUserName(period.userid);
        
        // Se il nome non è disponibile, salta questo periodo nella visualizzazione
        // (non vogliamo mostrare UserID nella lista)
        if (!userName) {
          // Salta questo periodo - non ha un nome valido
          return;
        }
        
        // Evidenzia se corrisponde al mese richiesto
        // IMPORTANTE: Un periodo è rilevante se il mese corrisponde E (year corrisponde OPPURE year è NULL ma startDate indica l'anno corretto)
        let isRelevant = false;
        if (targetMonth && periodMonth == targetMonth) {
          if (!targetYear) {
            // Se non c'è targetYear, basta che il mese corrisponda
            isRelevant = true;
          } else {
            // Se c'è targetYear, verifica: (year corrisponde) OPPURE (year è NULL ma startDate indica l'anno corretto)
            if (periodYear == targetYear) {
              isRelevant = true;
            } else if (!periodYear && period.startdate) {
              // Se year è NULL ma abbiamo startdate, verifica l'anno da startdate
              try {
                const start = new Date(period.startdate);
                if (!isNaN(start.getTime()) && start.getFullYear() == targetYear) {
                  isRelevant = true;
                }
              } catch (e) {}
            }
          }
        }
        const marker = isRelevant ? ' ⭐' : '';
        
        // Formatta in modo esplicito per evitare confusioni
        const prevStatus = hasPrev ? 'COMPILATO' : 'NON COMPILATO';
        const consStatus = hasCons ? 'COMPILATO' : 'NON COMPILATO';
        
        context += `- ${userName}, ${type}, anno: ${periodYear || '?'}, mese: ${periodMonth ? (monthName || `mese ${periodMonth}`) : (period.startdate ? 'da startDate' : '?')}${marker}\n`;
        context += `  → PREVISIONALE: ${prevStatus} | CONSUNTIVO: ${consStatus}\n`;
        
        // Se il previsionale è compilato, mostra gli indicatori principali per analisi comparative
        // IMPORTANTE: Se anche il consuntivo è compilato, mostra sempre tutti gli indicatori (anche zero) per calcolare scostamenti
        if (hasPrev && period.indicatorsprev && typeof period.indicatorsprev === 'object') {
          const indicators = period.indicatorsprev;
          const gi = indicators.gi || indicators.GI || 0;
          const vss = indicators.vss || indicators.VSS || 0;
          const vsdPersonale = indicators.vsdpersonale || indicators.VSDPersonale || indicators.vsd_personale || 0;
          const nncf = indicators.nncf || indicators.NNCF || 0;
          
          const values = [];
          // Se il consuntivo è anche compilato, mostra sempre tutti gli indicatori (anche zero) per calcolare scostamenti
          if (hasCons) {
            values.push(`GI: €${gi.toLocaleString('it-IT')}`);
            values.push(`VSS: €${vss.toLocaleString('it-IT')}`);
            values.push(`VSDPersonale: €${vsdPersonale.toLocaleString('it-IT')}`);
            values.push(`NNCF: ${nncf}`);
          } else {
            // Altrimenti mostra solo valori significativi (non zero)
            if (gi > 0) values.push(`GI: €${gi.toLocaleString('it-IT')}`);
            if (vss > 0) values.push(`VSS: €${vss.toLocaleString('it-IT')}`);
            if (vsdPersonale > 0) values.push(`VSDPersonale: €${vsdPersonale.toLocaleString('it-IT')}`);
            if (nncf > 0) values.push(`NNCF: ${nncf}`);
          }
          
          if (values.length > 0) {
            context += `  → Indicatori PREVISIONALE: ${values.join(', ')}\n`;
          }
        }
        
        // Se il consuntivo è compilato, mostra gli indicatori principali
        // IMPORTANTE: Mostra sempre gli indicatori consuntivi se disponibili, anche se il valore è 0
        // Questo è cruciale per calcolare gli scostamenti
        if (hasCons && period.indicatorscons && typeof period.indicatorscons === 'object') {
          const indicators = period.indicatorscons;
          const gi = indicators.gi || indicators.GI || 0;
          const vss = indicators.vss || indicators.VSS || 0;
          const vsdPersonale = indicators.vsdpersonale || indicators.VSDPersonale || indicators.vsd_personale || 0;
          const nncf = indicators.nncf || indicators.NNCF || 0;
          
          const values = [];
          // Mostra sempre tutti gli indicatori principali, anche se zero, per permettere calcoli di scostamento
          values.push(`GI: €${gi.toLocaleString('it-IT')}`);
          values.push(`VSS: €${vss.toLocaleString('it-IT')}`);
          values.push(`VSDPersonale: €${vsdPersonale.toLocaleString('it-IT')}`);
          values.push(`NNCF: ${nncf}`);
          
          context += `  → Indicatori CONSUNTIVO: ${values.join(', ')}\n`;
        }
      });
      context += '\n';
    }

    if (data.users && data.users.length > 0) {
      context += `UTENTI/CONSULENTI (${data.users.length} totali):\n`;
      data.users.forEach(u => {
        context += `- ${u.name} (ruolo: ${u.role})\n`;
      });
      context += '\n';
      // Estrai mese/anno dinamico dalla domanda per le istruzioni
      const currentDate = new Date();
      const instructionYear = targetYear || currentDate.getFullYear();
      const instructionMonth = targetMonth || currentDate.getMonth() + 1;
      const instructionMonthName = monthNames[Object.keys(monthNames).find(k => monthNames[k] === instructionMonth)] || 'mese indicato';
      
      context += `ISTRUZIONE CRITICA E FONDAMENTALE - METODO STEP-BY-STEP:\n\n`;
      context += `Per trovare chi ha compilato il BP previsionale di ${instructionMonthName} ${instructionYear}, segui QUESTI PASSAGGI OBBLIGATORI:\n\n`;
      context += `PASSO 1: Dalla lista PERIODI qui sopra, filtra SOLO quelli con type="mensile" (ignora settimanali/trimestrali/ecc.)\n`;
      context += `PASSO 2: Per ogni periodo mensile, verifica se corrisponde a ${instructionMonthName} ${instructionYear}:\n`;
      context += `  - Se year=${instructionYear} E month=${instructionMonth} → CORRISPONDE\n`;
      context += `  - Se year/month sono NULL ma startDate è "2025-11-01" o simile (inizio mese di novembre) → CORRISPONDE\n`;
      context += `  - Se startDate cade nel mese ${instructionMonthName} ${instructionYear} → CORRISPONDE\n`;
      context += `PASSO 3: Per ogni periodo mensile CORRISPONDENTE, controlla la riga "PREVISIONALE:"\n`;
      context += `  - Se dice "PREVISIONALE: COMPILATO" → QUEL CONSULENTE HA COMPILATO\n`;
      context += `  - Se dice "PREVISIONALE: NON COMPILATO" → QUEL CONSULENTE NON HA COMPILATO\n`;
      context += `PASSO 4: Crea una lista FINALE con TUTTI i nomi dei consulenti che hanno "PREVISIONALE: COMPILATO"\n`;
      context += `PASSO 5: Cerca ogni nome nella lista UTENTI/CONSULENTI per assicurarti che il nome esista\n`;
      context += `PASSO 6: Elenca TUTTI i nomi trovati in ordine alfabetico, senza duplicati\n\n`;
      context += `ATTENZIONI CRITICHE:\n`;
      context += `- NON saltare nessun periodo mensile rilevante - controlla TUTTI quelli marcati con ⭐\n`;
      context += `- Se vedi startDate "2025-11-01" o nel mese di novembre, è RILEVANTE anche se year/month sono NULL\n`;
      context += `- USA SEMPRE I NOMI dalla lista UTENTI/CONSULENTI, MAI gli ID\n`;
      context += `- NON dire "altri" o "altri 2" - elenca SEMPRE i nomi completi\n`;
      context += `- Se hai 4 periodi mensili con previsionale compilato, devi elencare 4 NOMI\n`;
      context += `- NON inventare o supporre - usa SOLO i dati forniti nella lista PERIODI\n`;
      context += `- PER CLASSIFICHE/ANALISI DI UN MESE: usa SOLO periodi MENSILI (type="mensile"), NON settimanali\n`;
      context += `- NON SOMMARE MAI periodi settimanali con mensili - i settimanali sono solo lo spaccato del mensile\n\n`;
      context += `CALCOLO SCOSTAMENTI PREVISIONALE vs CONSUNTIVO:\n`;
      context += `- Quando l'utente chiede "scostamento", "differenza", "confronto", "divergenza", "gap" tra previsionale e consuntivo:\n`;
      context += `  * Per ogni periodo rilevante, verifica se ha ENTRAMBI "PREVISIONALE: COMPILATO" E "CONSUNTIVO: COMPILATO"\n`;
      context += `  * Se entrambi sono compilati, calcola la differenza per ogni indicatore:\n`;
      context += `    - Scostamento GI = GI_consuntivo - GI_previsionale\n`;
      context += `    - Scostamento VSS = VSS_consuntivo - VSS_previsionale\n`;
      context += `    - Scostamento VSDPersonale = VSDPersonale_consuntivo - VSDPersonale_previsionale\n`;
      context += `    - Scostamento NNCF = NNCF_consuntivo - NNCF_previsionale\n`;
      context += `  * Mostra per ogni consulente:\n`;
      context += `    - Valori PREVISIONALI (da "Indicatori PREVISIONALE")\n`;
      context += `    - Valori CONSUNTIVI (da "Indicatori CONSUNTIVO")\n`;
      context += `    - Scostamenti (valore positivo = obiettivo SUPERATO, negativo = obiettivo MANCATO)\n`;
      context += `  * Se un periodo ha solo previsionale o solo consuntivo, dillo esplicitamente\n`;
      context += `  * Se non ci sono consuntivi per il periodo richiesto, spiega che il consuntivo viene compilato alla fine del periodo\n`;
      context += `  * Esempio di risposta: "Per Enrico Rizzi a novembre 2025: GI previsto €30.000, consuntivo €32.000, scostamento +€2.000 (superato)"\n\n`;
      
      context += `CALCOLO PROVVIGIONI:\n`;
      context += `- Quando l'utente chiede "provvigioni", "commissioni", "quanto guadagno", "stipendio", "paga", "compenso":\n`;
      context += `  * Per ogni consulente, calcola:\n`;
      context += `    - ProvvGI = GI × 0.15 (15% del GI, per tutti)\n`;
      context += `    - Verifica il grade dell'utente (junior o senior)\n`;
      context += `    - Se junior: ProvvVSD = VSDPersonale × 0.20 (20% del VSDPersonale)\n`;
      context += `    - Se senior: ProvvVSD = VSDPersonale × 0.25 (25% del VSDPersonale)\n`;
      context += `    - Totale Provvigioni = ProvvGI + ProvvVSD\n`;
      context += `  * Per provvigioni PREVISTE: usa i valori dagli indicatori PREVISIONALI (indicatorsprev)\n`;
      context += `  * Per provvigioni CONSUNTIVE: usa i valori dagli indicatori CONSUNTIVI (indicatorscons)\n`;
      context += `  * IMPORTANTE: VSDPersonale è diverso da VSDIndiretto - le provvigioni si calcolano SOLO su VSDPersonale\n`;
      context += `  * Se il grade non è disponibile, assumi junior (20%)\n`;
      context += `  * Esempio: "Enrico Rizzi (junior) a novembre 2025: GI €30.000 → ProvvGI €4.500, VSDPersonale €14.000 → ProvvVSD €2.800, Totale €7.300"\n\n`;
      
      // Istruzione per disponibilità/slot liberi
      if (lowerMessage.includes('slot') || lowerMessage.includes('disponibil') || lowerMessage.includes('liber')) {
        context += 'ISTRUZIONE PER DISPONIBILITÀ: Per trovare chi ha più slot/giornate libere, confronta la lista UTENTI con gli APPUNTAMENTI. ';
        context += 'Conta gli appuntamenti per ogni utente nel mese richiesto. ';
        context += 'Chi ha MENO appuntamenti = ha PIÙ slot liberi/giornate libere. ';
        context += 'Ordina gli utenti dal meno appuntamenti al più appuntamenti per identificare chi ha più disponibilità. ';
        context += 'IMPORTANTE: Quando rispondi, usa SEMPRE i NOMI degli utenti (non gli ID).\n\n';
      }
    }

    if (data.leads && data.leads.length > 0) {
      const isAdmin = user && user.role === 'admin';
      
      // Se admin e ci sono lead di più consulenti, raggruppa per consulente
      if (isAdmin) {
        const leadsByConsultant = {};
        data.leads.forEach(lead => {
          const consultantId = lead.consulente_assegnato || lead.consultantId || 'senza_consulente';
          const consultantName = getUserName(consultantId) || 'Sconosciuto';
          if (!leadsByConsultant[consultantName]) {
            leadsByConsultant[consultantName] = [];
          }
          leadsByConsultant[consultantName].push(lead);
        });
        
        const consultantNames = Object.keys(leadsByConsultant).sort();
        if (consultantNames.length > 1) {
          context += `LEADS (${data.leads.length} totali, suddivisi per consulente):\n`;
          consultantNames.forEach(consultantName => {
            const leads = leadsByConsultant[consultantName];
            context += `- ${consultantName}: ${leads.length} lead\n`;
            leads.slice(0, 5).forEach(lead => {
              context += `  • ${lead.nome_lead}${lead.azienda_lead ? ` (${lead.azienda_lead})` : ''}, stato: ${lead.contatto_avvenuto ? 'contattato' : 'da contattare'}\n`;
            });
            if (leads.length > 5) {
              context += `  ... e altri ${leads.length - 5} lead\n`;
            }
          });
        } else {
          // Un solo consulente, formato normale
          context += `LEADS (${data.leads.length}):\n`;
          data.leads.slice(0, 10).forEach(lead => {
            context += `- ${lead.nome_lead}${lead.azienda_lead ? ` (${lead.azienda_lead})` : ''}, stato: ${lead.contatto_avvenuto ? 'contattato' : 'da contattare'}\n`;
          });
        }
      } else {
        // Non admin: formato normale
        context += `LEADS (${data.leads.length}):\n`;
        data.leads.slice(0, 10).forEach(lead => {
          context += `- ${lead.nome_lead}${lead.azienda_lead ? ` (${lead.azienda_lead})` : ''}, stato: ${lead.contatto_avvenuto ? 'contattato' : 'da contattare'}\n`;
        });
      }
      context += '\n';
    }

    if (data.vendite && data.vendite.length > 0) {
      const monthLabel = targetMonth ? ` per ${Object.keys(monthNames).find(k => monthNames[k] === targetMonth)} ${targetYear}` : '';
      context += `VENDITE/RIORDINI (${data.vendite.length}${monthLabel}):\n`;
      data.vendite.slice(0, 20).forEach(v => {
        const dataVendita = v.data_vendita ? new Date(v.data_vendita).toLocaleDateString('it-IT') : 'data non disponibile';
        context += `- ${v.cliente || v.nome_cliente || 'Cliente sconosciuto'}: €${(v.valore_proposto || v.valore || 0).toLocaleString('it-IT')} (${v.stato || 'stato sconosciuto'}), data: ${dataVendita}\n`;
      });
      if (data.vendite.length > 20) {
        context += `... e altri ${data.vendite.length - 20} vendite\n`;
      }
      context += '\n';
    } else if (lowerMessage.includes('vendita') || lowerMessage.includes('vendite')) {
      // Se la domanda riguarda vendite ma non ci sono risultati
      context += `VENDITE/RIORDINI: Nessuna vendita trovata${targetMonth ? ` per ${Object.keys(monthNames).find(k => monthNames[k] === targetMonth)} ${targetYear}` : ''}.\n\n`;
    }

    if (data.cicli && data.cicli.length > 0) {
      context += `CICLI APERTI (${data.cicli.length}):\n`;
      data.cicli.slice(0, 20).forEach(ciclo => {
        const priorityLabel = ciclo.priority === 'high' ? 'Alta' : ciclo.priority === 'medium' ? 'Media' : 'Bassa';
        const deadlineInfo = ciclo.deadlinetype ? `, scadenza: ${ciclo.deadlinetype}` : '';
        context += `- ${ciclo.description || 'Nessuna descrizione'}: Priorità ${priorityLabel}${deadlineInfo}, Consulente: ${getUserName(ciclo.consultantid || ciclo.consultantId)}\n`;
      });
      if (data.cicli.length > 20) {
        context += `... e altri ${data.cicli.length - 20} cicli\n`;
      }
      context += '\n';
    }

    if (data.gi && data.gi.length > 0) {
      const monthLabel = targetMonth ? ` per ${Object.keys(monthNames).find(k => monthNames[k] === targetMonth)} ${targetYear}` : '';
      context += `GI & SCADENZARIO (${data.gi.length}${monthLabel}):\n`;
      data.gi.slice(0, 20).forEach(gi => {
        const clientName = gi.clientname || gi.clientName || 'Cliente sconosciuto';
        const consultantName = getUserName(gi.consultantid || gi.consultantId);
        const dateStr = gi.date || gi.data ? new Date(gi.date || gi.data).toLocaleDateString('it-IT') : 'data non disponibile';
        const vssTotal = gi.vsstotal || gi.vssTotal || 0;
        context += `- ${clientName} (${consultantName}): €${vssTotal.toLocaleString('it-IT')}, data: ${dateStr}\n`;
        
        // Mostra scadenze se presenti nello schedule
        if (gi.schedule && Array.isArray(gi.schedule) && gi.schedule.length > 0) {
          const prossimeScadenze = gi.schedule
            .filter(s => {
              const dueDate = s.dueDate || s.due_date;
              if (!dueDate) return false;
              const dateObj = new Date(dueDate);
              const now = new Date();
              // Mostra scadenze future o prossime (ultimi 30 giorni)
              const daysDiff = (dateObj - now) / (1000 * 60 * 60 * 24);
              return daysDiff >= -30 && daysDiff <= 90;
            })
            .slice(0, 3)
            .map(s => {
              const dueDate = s.dueDate || s.due_date;
              const dateStr = new Date(dueDate).toLocaleDateString('it-IT');
              const amount = s.amount || 0;
              const note = s.note || '';
              return `  • Scadenza ${dateStr}: €${amount.toLocaleString('it-IT')}${note ? ` (${note})` : ''}\n`;
            })
            .join('');
          if (prossimeScadenze) {
            context += prossimeScadenze;
          }
        }
      });
      if (data.gi.length > 20) {
        context += `... e altri ${data.gi.length - 20} record GI\n`;
      }
      context += '\n';
    }

    if (data.corsi && data.corsi.length > 0) {
      const monthLabel = targetMonth ? ` per ${Object.keys(monthNames).find(k => monthNames[k] === targetMonth)} ${targetYear}` : '';
      context += `CORSI INTERAZIENDALI (${data.corsi.length}${monthLabel}):\n`;
      data.corsi.slice(0, 20).forEach(corso => {
        const nome = corso.nome_corso || corso.titolo || 'Corso sconosciuto';
        const costo = corso.costo_corso || corso.costo || 0;
        const iscrizioni = corso.corsi_iscrizioni ? corso.corsi_iscrizioni.length : 0;
        context += `- ${nome}, costo: €${costo.toLocaleString('it-IT')}, iscrizioni: ${iscrizioni}`;
        
        // Mostra date se disponibili
        if (corso.corsi_date && corso.corsi_date.length > 0) {
          const dates = corso.corsi_date.map(d => {
            if (!d.data_corso) return '';
            const date = new Date(d.data_corso);
            return date.toLocaleDateString('it-IT');
          }).filter(d => d).join(', ');
          if (dates) context += `, date: ${dates}`;
        }
        context += '\n';
      });
      if (data.corsi.length > 20) {
        context += `... e altri ${data.corsi.length - 20} corsi\n`;
      }
      context += '\n';
    } else if (lowerMessage.includes('corso') || lowerMessage.includes('corsi') || lowerMessage.includes('leadership')) {
      // Se la domanda riguarda corsi ma non ci sono risultati
      context += `CORSI INTERAZIENDALI: Nessun corso trovato${targetMonth ? ` per ${Object.keys(monthNames).find(k => monthNames[k] === targetMonth)} ${targetYear}` : ''}.\n\n`;
    }

    if (context === 'Dati disponibili dal database:\n\n') {
      context += 'Nessun dato specifico disponibile per questa query.\n';
    }

    return context;
  }
};

