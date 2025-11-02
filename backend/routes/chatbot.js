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
      const dataContext = formatDataContext(relevantData, message);

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
      vendite: null,
      users: null
    };

    const lowerMessage = message.toLowerCase();
    const isAdmin = user.role === 'admin';
    
    // Determina se la query richiede dati di tutti i consulenti o uno specifico
    const wantsAllConsultants = isAdmin && (
      lowerMessage.includes('tutti') || 
      lowerMessage.includes('squadra') || 
      lowerMessage.includes('global') ||
      lowerMessage.includes('team') ||
      lowerMessage.includes('chi non ha') ||
      lowerMessage.includes('chi ha fatto') ||
      lowerMessage.includes('chi manca') ||
      lowerMessage.includes('manca il bp') ||
      lowerMessage.includes('non hanno fatto')
    );
    
    // Estrae nome consulente se specificato (solo per admin)
    let specificConsultantId = null;
    if (isAdmin && !wantsAllConsultants) {
      // Cerca nomi di consulenti nel messaggio
      // TODO: potrebbe essere migliorato con una query alla tabella users
      // Per ora assumiamo che se non dice "tutti" allora vuole i suoi dati
    }

    try {
      // Estrai mese/anno dalla domanda se menzionati
      const monthNames = {
        'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
        'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
      };
      let targetMonth = null;
      let targetYear = new Date().getFullYear();
      
      for (const [name, num] of Object.entries(monthNames)) {
        if (lowerMessage.includes(name)) {
          targetMonth = num;
          break;
        }
      }
      // Cerca anche numeri di mese
      const monthMatch = lowerMessage.match(/(?:mese|month)\s+(\d+)|(\d+)\s+(?:novembre|ottobre|dicembre|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre)/i);
      if (!targetMonth && monthMatch) {
        targetMonth = parseInt(monthMatch[1] || monthMatch[2]) || null;
      }
      
      // Query per appuntamenti (se menzionati)
      const needsAppointments = lowerMessage.includes('appuntamento') || 
          lowerMessage.includes('incontro') || 
          lowerMessage.includes('riunione') ||
          lowerMessage.includes('prossim') ||
          lowerMessage.includes('oggi') ||
          lowerMessage.includes('domani') ||
          lowerMessage.includes('slot') ||
          lowerMessage.includes('disponibil') ||
          lowerMessage.includes('giornate libere') ||
          lowerMessage.includes('giorni liberi') ||
          lowerMessage.includes('liber') ||
          targetMonth !== null;
      
      if (needsAppointments) {
        // Determina filtro data: se dice "prossimi", "domani", "oggi" -> solo futuri
        const wantsFuture = lowerMessage.includes('prossim') || 
                           lowerMessage.includes('domani') || 
                           lowerMessage.includes('oggi') ||
                           lowerMessage.includes('futur');
        
        // Calcola range date
        let startDate = null;
        let endDate = null;
        
        if (targetMonth !== null) {
          // Filtra per mese specifico
          startDate = new Date(targetYear, targetMonth - 1, 1);
          endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
        } else if (wantsFuture) {
          // Solo futuri
          startDate = new Date();
          startDate.setHours(0, 0, 0, 0);
        }
        
        let query = supabase
          .from('appointments')
          .select('id, client, start_time, type, vss, nncf, userid')
          .limit(500); // Aumentato per analisi disponibilità
        
        // Filtro per consulente - per disponibilità serve vedere tutti
        if (!isAdmin || !wantsAllConsultants) {
          // Solo se non chiede disponibilità/slot di tutti
          if (!lowerMessage.includes('slot') && !lowerMessage.includes('disponibil') && !lowerMessage.includes('liber')) {
            query = query.eq('userid', user.id);
          }
        }
        
        // Filtro per data
        if (startDate) {
          query = query.gte('start_time', startDate.toISOString());
        }
        if (endDate) {
          query = query.lte('start_time', endDate.toISOString());
        } else if (wantsFuture && !targetMonth) {
          // Solo futuri se non specificato mese
          query = query.gte('start_time', startDate.toISOString());
        }
        
        // Ordina per data: ascending per prossimi/futuri, descending per storici
        query = query.order('start_time', { ascending: wantsFuture || targetMonth !== null });
        
        const { data: appointments } = await query;
        data.appointments = appointments || [];
        
        // Se chiede disponibilità/slot, serve anche lista utenti
        if ((lowerMessage.includes('slot') || lowerMessage.includes('disponibil') || lowerMessage.includes('liber')) && isAdmin) {
          const { data: users } = await supabase
            .from('app_users')
            .select('id, name, role')
            .eq('role', 'consultant')
            .order('name', { ascending: true });
          
          data.users = users || [];
        }
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

      // Query per periodi/KPI/BP
      if (lowerMessage.includes('periodo') || 
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
          lowerMessage.includes('manca')) {
        
        // Per domande su "chi non ha fatto" servono tutti i periodi
        const needsAllPeriods = wantsAllConsultants || 
                                lowerMessage.includes('chi non ha') ||
                                lowerMessage.includes('chi ha fatto') ||
                                lowerMessage.includes('manca');
        
        let query = supabase
          .from('periods')
          .select('*')
          .order('createdat', { ascending: false })
          .limit(200); // Aumentato per analisi complete
        
        // Filtro per consulente
        if (!isAdmin || !needsAllPeriods) {
          query = query.eq('userid', user.id);
        }
        
        const { data: periods } = await query;
        data.periods = periods || [];
        
        // Se la domanda riguarda "chi non ha fatto", servono anche gli utenti per confronto
        if (needsAllPeriods && isAdmin) {
          const { data: users } = await supabase
            .from('app_users')
            .select('id, name, role')
            .eq('role', 'consultant')
            .order('name', { ascending: true });
          
          data.users = users || [];
        }
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

**Provvigioni** (sinonimo di Commissioni, ma usiamo sempre "Provvigioni"): Calcolate su risultati. ProvvGI = 15% del GI (per tutti). ProvvVSD = 20% (junior) o 25% (senior) del VSDPersonale SOLO (non su VSDIndiretto).

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

RISPOSTE:
- Sii preciso e basato sui dati forniti
- ANALIZZA i dati forniti: confronta, identifica differenze, trova chi manca
- Per domande tipo "chi non ha fatto X", confronta la lista utenti con i dati (es. periodi) e identifica chi manca
- Usa numeri e date specifiche quando disponibili
- Formatta le date in italiano (es. 15 gennaio 2025)
- Per importi, usa formato euro (€ 1.234,56)
- Sii professionale ma amichevole
- Se la domanda è ambigua, chiedi chiarimenti
- Non inventare dati che non sono stati forniti
- Focalizzati su analisi e insights utili per il lavoro commerciale
- Per Battle Plan: un periodo ha "type" (weekly/monthly/quarterly/semiannual/annual), "year", "month", "week", "quarter", "semester", "indicatorsprev" (previsionale), "indicatorscons" (consuntivo)

ANALISI COMPARATIVE:
- Quando hai una lista di UTENTI e una lista di PERIODI, confronta:
  * Trova quali userid hanno periodi per un determinato mese/anno/tipo
  * Identifica quali utenti MANCANO confrontando la lista utenti con i periodi presenti
  * Analizza indicatori previsionali vs consuntivi

- Quando hai una lista di UTENTI e una lista di APPUNTAMENTI per determinare disponibilità/slot liberi:
  * Conta gli appuntamenti per ogni userid (consulente)
  * Chi ha MENO appuntamenti = ha PIÙ slot liberi/giornate libere
  * Confronta i conteggi e identifica chi ha più disponibilità
  * Se il mese è specificato (es. "novembre"), filtra solo gli appuntamenti di quel mese

${isAdmin ? '- Se l\'utente è admin e chiede "chi non ha fatto", "chi manca", "chi ha più slot liberi", "disponibilità", "tutti", "squadra", "team" o "global", usa i dati aggregati forniti e fai analisi comparative.' : '- Mostra SOLO i dati del consulente corrente, non hai accesso ad altri consulenti.'}

RISPOSTE IN ITALIANO.`;
  }

  /**
   * Formatta i dati per il contesto del chatbot
   */
  function formatDataContext(data, message = '') {
    let context = 'Dati disponibili dal database:\n\n';
    const lowerMessage = (message || '').toLowerCase();

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
          context += `- UserID ${uid}: ${info.count} appuntamenti\n`;
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
          context += `- UserID: ${apt.userid}, ${apt.client} il ${dateStr} alle ${timeStr}, tipo: ${apt.type}\n`;
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
      context += `CLIENTI (${data.clients.length}):\n`;
      data.clients.slice(0, 15).forEach(client => {
        context += `- ${client.name} (${client.status})\n`;
      });
      context += '\n';
    }

    if (data.periods && data.periods.length > 0) {
      context += `PERIODI/KPI/BP (${data.periods.length} totali):\n`;
      
      // Mostra tutti i periodi con dettagli completi per analisi
      data.periods.slice(0, 50).forEach(period => {
        const typeLabels = {
          weekly: 'settimanale',
          monthly: 'mensile',
          quarterly: 'trimestrale',
          semiannual: 'semestrale',
          annual: 'annuale'
        };
        const type = typeLabels[period.type] || period.type;
        const hasPrev = period.indicatorsprev && Object.keys(period.indicatorsprev).length > 0;
        const hasCons = period.indicatorscons && Object.keys(period.indicatorscons).length > 0;
        const monthName = period.month ? new Date(2000, period.month - 1).toLocaleString('it-IT', { month: 'long' }) : '';
        context += `- UserID: ${period.userid}, ${type}, anno: ${period.year || '?'}, mese: ${monthName} ${period.month || '?'}, previsionale: ${hasPrev ? 'SÌ' : 'NO'}, consuntivo: ${hasCons ? 'SÌ' : 'NO'}\n`;
      });
      context += '\n';
    }

    if (data.users && data.users.length > 0) {
      context += `UTENTI/CONSULENTI (${data.users.length} totali):\n`;
      data.users.forEach(u => {
        context += `- ${u.name} (ID: ${u.id}, ruolo: ${u.role})\n`;
      });
      context += '\n';
      context += 'ISTRUZIONE IMPORTANTE: Per trovare chi non ha fatto il BP previsionale, confronta la lista UTENTI con i PERIODI. ';
      context += 'Per ogni utente nella lista, controlla se esiste un periodo con: type="monthly", year=2025, month=11 (novembre), e indicatorsprev non vuoto. ';
      context += 'Gli utenti che NON hanno un periodo con queste caratteristiche sono quelli che NON hanno fatto il BP previsionale per novembre 2025.\n\n';
      
      // Istruzione per disponibilità/slot liberi
      if (lowerMessage.includes('slot') || lowerMessage.includes('disponibil') || lowerMessage.includes('liber')) {
        context += 'ISTRUZIONE PER DISPONIBILITÀ: Per trovare chi ha più slot/giornate libere, confronta la lista UTENTI con gli APPUNTAMENTI. ';
        context += 'Conta gli appuntamenti per ogni userid nel mese richiesto. ';
        context += 'Chi ha MENO appuntamenti = ha PIÙ slot liberi/giornate libere. ';
        context += 'Ordina gli utenti dal meno appuntamenti al più appuntamenti per identificare chi ha più disponibilità.\n\n';
      }
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

