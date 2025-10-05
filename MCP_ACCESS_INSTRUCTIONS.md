# MCP Access Instructions per BPApp

## Panoramica
Il progetto BPApp è presente e attivo su tre piattaforme principali. Per accedere a ciascuna piattaforma, utilizzare i seguenti MCP:

## 1. GitHub - Repository Sorgente
**MCP**: `mcp_github_*`

**Dettagli progetto**:
- Repository: `enricorizzi-cmd/BPApp`
- Descrizione: "Battle Plan"
- URL: https://github.com/enricorizzi-cmd/BPApp
- Status: Attivo (ultimo push: 5 settembre 2025)

**Funzioni principali**:
- Lettura file del repository
- Gestione issues e pull requests
- Controllo commit e branch
- Ricerca codice

## 2. Supabase - Database PostgreSQL
**MCP**: `mcp_supabasedim_*`

**Dettagli progetto**:
- Nome: "Battle Plan"
- ID: `bzvdbmofetujylvgcmqx`
- Status: ACTIVE_HEALTHY
- Database: PostgreSQL 17.4.1
- Creato: 2 settembre 2025

**Funzioni principali**:
- Gestione tabelle e migrazioni
- Esecuzione query SQL
- Gestione Edge Functions
- Monitoraggio logs e advisor
- Gestione branch di sviluppo

## 3. Render - Hosting Applicazione
**MCP**: `mcp_renderdim_*`

**Dettagli servizio**:
- Nome: "BPApp - Battle Plan"
- URL: https://bpapp-battle-plan.onrender.com
- Repository collegato: https://github.com/enricorizzi-cmd/BPApp
- Status: Attivo (Docker)
- Health Check: `/api/health`
- Creato: 2 settembre 2025

**Funzioni principali**:
- Monitoraggio servizi e deploy
- Gestione variabili ambiente
- Visualizzazione logs
- Gestione metriche e performance
- Gestione database Postgres e Key-Value

## Utilizzo
Per accedere a qualsiasi funzionalità del progetto BPApp, utilizzare il prefisso MCP appropriato:

- **Codice sorgente**: `mcp_github_*`
- **Database**: `mcp_supabasedim_*`  
- **Hosting**: `mcp_renderdim_*`

Questi MCP permettono di gestire completamente il progetto BPApp su tutte e tre le piattaforme.
