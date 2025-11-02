# Configurazione Chatbot AI

Il chatbot AI è stato integrato nell'applicazione e utilizza OpenAI per fornire risposte intelligenti basate sui dati del database Supabase.

## Componenti

- **Backend**: Route `/api/chatbot/query` in `backend/routes/chatbot.js`
- **Frontend**: FAB button e modal in `frontend/lib/chatbot.js`
- **CSS**: Stili in `frontend/css/chatbot.css`

## Configurazione Variabile d'Ambiente

### Su Render

La chiave API di OpenAI deve essere configurata come variabile d'ambiente su Render:

1. Accedi al tuo progetto su Render Dashboard
2. Vai su **Environment** nel menu laterale
3. Aggiungi una nuova variabile:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: `sk-proj-...` (la tua chiave API OpenAI completa)
4. Salva le modifiche
5. Riavvia il servizio per applicare le modifiche

### In Locale (sviluppo)

Crea o modifica il file `backend/.env`:

```env
OPENAI_API_KEY=sk-proj-...la_tua_chiave_completa...
```

⚠️ **IMPORTANTE**: Non committare il file `.env` nel repository Git!

## Funzionalità

Il chatbot può:

- **Analizzare dati**: Appuntamenti, clienti, vendite, KPI, leads, corsi
- **Rispondere a domande** su:
  - Prossimi appuntamenti
  - Statistiche clienti
  - Performance KPI
  - Stato leads
  - Corsi e iscrizioni
  - Vendite e fatturato
- **Fornire insights** basati sui dati reali del database
- **Contestualizzare** le risposte in base al ruolo dell'utente (admin vs consulente)

## Uso

1. Dopo il login, un FAB button (Floating Action Button) appare in basso a sinistra
2. Clicca sul FAB per aprire il modal del chatbot
3. Scrivi una domanda nella casella di input
4. Il chatbot analizza i dati rilevanti e fornisce una risposta

## Sicurezza

- ✅ La chiave API è memorizzata solo come variabile d'ambiente (mai nel codice)
- ✅ Le query al database rispettano i permessi utente (RLS/consulente)
- ✅ Le risposte sono limitate a dati accessibili dall'utente corrente
- ✅ Il backend valida l'autenticazione per ogni richiesta

## Installazione Dipendenze

Se non installate automaticamente, installa la dipendenza OpenAI:

```bash
cd backend
npm install openai
```

## Troubleshooting

### Il chatbot non appare
- Verifica di essere loggato
- Controlla la console del browser per errori
- Verifica che `frontend/lib/chatbot.js` sia importato in `main.js`

### Errore "Chatbot non disponibile"
- Verifica che `OPENAI_API_KEY` sia configurata su Render
- Controlla i log del backend per errori
- Riavvia il servizio su Render dopo aver aggiunto la variabile

### Il chatbot non risponde correttamente
- Verifica che Supabase sia configurato correttamente
- Controlla i log del backend per errori di query
- Verifica i permessi dell'utente sul database

