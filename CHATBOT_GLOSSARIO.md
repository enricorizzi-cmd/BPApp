# 📚 GLOSSARIO COMPLETO - Battle Plan App

## 🎯 **ACRONIMI E TERMINI TECNICI**

### **BP - Battle Plan (Piano di Battaglia)**
**Definizione**: Il piano di programmazione del consulente. Sistema di pianificazione e monitoraggio delle attività commerciali attraverso periodi (settimanali, mensili, trimestrali, semestrali, annuali).

**Previsionale vs Consuntivo**:
- **Previsionale**: Piano programmato all'inizio del periodo con obiettivi e target (indicatorsprev)
- **Consuntivo**: Verifica dei target raggiunti alla fine del periodo con risultati effettivi (indicatorscons)
- Per ogni settimana/mese/trimestre/ecc. il consulente crea un PREVISIONALE e al termine deve fare un CONSUNTIVO che verifica i target raggiunti o meno

**Caratteristiche**:
- Contiene indicatori previsionali (indicatorsprev) e consuntivi (indicatorscons)
- Tipi di periodo: settimanale, mensile, trimestrale, semestrale, annuale
- Ogni periodo ha: type, year, month, week, quarter, semester, indicatorsprev, indicatorscons

---

### **GI - Gross Income (Valore dell'Incassato)**
**Definizione**: Valore dell'incassato, rappresenta l'importo effettivamente incassato/guadagnato.

**Dettagli**:
- Commissione GI: 15% per tutti (junior e senior)
- Appare nei periodi come indicatore monetario
- Usato per calcolare provvigioni (ProvvGI)
- Target mensili: Junior €10.000, Senior €15.000

---

### **VSS - Value Services Sold (Valore dei Servizi Venduti)**
**Definizione**: Il venduto, valore monetario dei servizi venduti. Indicatore principale delle vendite effettive.

**Utilizzo**:
- Misura le vendite chiuse
- Inserito negli appuntamenti come valore previsto o effettivo
- Target mensili:
  - Junior: €15.000
  - Senior: €30.000

---

### **VSD - Value Services Delivered (Valore dei Servizi Erogati)**
**Definizione**: Valore dei servizi erogati/deliverati. Si divide in:
- **VSDPersonale** (o VSD Personale): valore dei servizi erogati direttamente dal consulente (attività erogate direttamente)
- **VSDIndiretto** (o VSD Indiretto): valore dei servizi interaziendali erogati non direttamente dal consulente (es. corsi in cui il cliente ha usufruito del servizio erogato non direttamente dal consulente)

**Dettagli**:
- Target mensili Junior: VSDPersonale €5.000, VSDIndiretto €5.000
- Target mensili Senior: VSDPersonale €15.000, VSDIndiretto €5.000
- Commissioni VSD:
  - Junior: 20%
  - Senior: 25%

---

### **NNCF - New Name in Central File (Nuovo Cliente)**
**Definizione**: Numero dei nuovi clienti acquisiti. Indicatore che conta quanti nuovi clienti sono stati aggiunti al database (Central File).

**Utilizzo**:
- Campo booleano negli appuntamenti (true/false) per indicare se l'appuntamento ha portato a un nuovo cliente
- Contatore nei periodi per il numero totale di nuovi clienti
- Target mensili:
  - Junior: 4 NNCF
  - Senior: 1 NNCF
- Quando un appuntamento diventa NNCF, il cliente passa automaticamente da status "potenziale" a "attivo"

---

### **KPI - Key Performance Indicator**
**Definizione**: Indicatori chiave di performance. Nel sistema sono:
- **Monetari**: VSS, VSDPersonale, VSDIndiretto, GI
- **Conteggio**: NNCF, AppFatti, Telefonate

**Sistema KPI**:
- Ogni periodo (BP) contiene un "bag" di indicatori
- Due modalità: **previsionale** (indicatorsprev) e **consuntivo** (indicatorscons)
- I KPI vengono inseriti nei periodi per monitorare le performance

---

### **Provvigioni**
**Definizione**: Commissioni calcolate in base ai risultati (sinonimo di Commissioni, ma si usa sempre "Provvigioni"). Tipi:
- **ProvvGI**: 15% del GI (uguale per tutti)
- **ProvvVSD**: 20% per junior, 25% per senior del VSDPersonale SOLO (non su VSDIndiretto)
- **TotProvvigioni**: Somma di ProvvGI + ProvvVSD

---

## 📅 **TIPI DI PERIODO**

### **Settimanale**
- Durata: 1 settimana
- Scaling target: 1/4 del mensile
- Arrotondamento target: ↑€500

### **Mensile**
- Durata: 1 mese
- Scaling target: 1x (base)
- Arrotondamento target: ↑€5.000

### **Trimestrale**
- Durata: 3 mesi
- Scaling target: 3x del mensile
- Arrotondamento target: ↑€5.000

### **Semestrale**
- Durata: 6 mesi
- Scaling target: 6x del mensile
- Arrotondamento target: ↑€5.000

### **Annuale**
- Durata: 12 mesi
- Scaling target: 12x del mensile
- Arrotondamento target: ↑€5.000

### **YTD (Year To Date)**
- Periodo: Dal 1 gennaio dell'anno corrente → fine mese corrente
- Usa bucket mensili per aggregazioni
- Filtro per vedere performance dall'inizio dell'anno

### **LTM (Last Twelve Months)**
- Periodo: Ultimi 12 mesi rolling (primo giorno di 11 mesi fa → fine mese corrente)
- Usa bucket mensili per aggregazioni
- Filtro per vedere performance degli ultimi 12 mesi

---

## 🎭 **TIPI DI APPUNTAMENTO**

### **Vendita**
- Durata default: 90 minuti
- Include: VSS, VSD personale, NNCF
- Tipo principale per vendite dirette

### **Mezza giornata**
- Durata default: 240 minuti (4 ore)
- VSD precompilato: €1.000

### **Giornata intera (Full)**
- Durata default: 570 minuti (9,5 ore)
- VSD precompilato: €2.000

### **iProfile**
- Durata default: 90 minuti
- VSD precompilato: €700
- Servizio specifico iProfile

### **Formazione**
- Durata default: 570 minuti (9,5 ore)
- Non richiede cliente specifico (può essere il nome stesso)
- Genera VSD indiretto

### **MBS**
- Durata default: 570 minuti
- Non richiede cliente specifico
- Genera VSD indiretto

### **Sottoprodotti**
- Durata default: 240 minuti
- Include: Telefonate, Appuntamenti fissati
- Non include VSS/VSD personali
- **Definizione**: Tutto ciò che precede la vendita. I sottoprodotti della vendita: fare appuntamenti, fare telefonate a freddo, fare visite a freddo, fissare appuntamenti, fare outbound mail o messaggi, ecc. È tutto ciò che un commerciale fa e precede la vendita.

### **Riunione**
- Durata default: 60 minuti
- Attività interna

### **Impegni personali**
- Durata default: 60 minuti
- Attività personale

---

## 👥 **GRADE (AVANZAMENTO DI CARRIERA)**

**Definizione**: Sistema di avanzamento di carriera di un consulente basato su risultati raggiunti.

**Come funziona**:
- Un consulente parte da **Junior**
- Passa a **Senior** dopo **3 mesi consecutivi con GI maggiore o uguale a €8.000**

### **Junior**
**Target mensili**:
- VSS: €15.000
- VSDPersonale: €5.000
- VSDIndiretto: €5.000
- GI: €10.000
- NNCF: 4
- AppFatti: 30
- Telefonate: 300

**Commissioni**:
- GI: 15%
- VSD: 20%

### **Senior**
**Target mensili**:
- VSS: €30.000
- VSDPersonale: €15.000
- VSDIndiretto: €5.000
- GI: €15.000
- NNCF: 1
- AppFatti: 4
- Telefonate: 0 (non specificato)

**Commissioni**:
- GI: 15%
- VSD: 25%

**Promozione a Senior**: 3 mesi consecutivi con GI >= €8.000 (promozione MANUALE, non automatica)

---

## 📊 **MODALITÀ BP**

### **Previsionale**
**Definizione**: Piano programmato all'inizio del periodo con obiettivi e target (indicatorsprev). Il consulente crea un PREVISIONALE per ogni settimana/mese/trimestre/ecc.

**Utilizzo**:
- Creato all'inizio del periodo
- Contiene gli obiettivi stabiliti
- Accessibile in "indicatorsprev"
- Si inseriscono i target previsti

### **Consuntivo**
**Definizione**: Verifica dei target raggiunti alla fine del periodo con risultati effettivi (indicatorscons). Al termine del periodo il consulente deve fare un CONSUNTIVO che verifica i target raggiunti o meno.

**Utilizzo**:
- Creato alla fine del periodo
- Contiene i risultati reali
- Accessibile in "indicatorscons"
- Si inseriscono i risultati effettivi raggiunti

---

## 👤 **STATUS CLIENTI**

### **Attivo**
**Definizione**: Cliente attivo con cui si lavora regolarmente.

**Come diventa attivo**:
- Quando un appuntamento viene marcato come NNCF (Nuovo Cliente)
- Automaticamente aggiornato dal sistema

### **Potenziale**
**Definizione**: Cliente potenziale che prevedi di incontrare e vendere, quindi farlo diventare cliente.

**Come diventa potenziale**:
- Creato automaticamente quando si crea un appuntamento con NNCF non selezionato
- Significa che prevedi di incontrarlo e vendere
- Può diventare "attivo" quando si chiude una vendita (NNCF=true)

### **Lead non chiuso**
**Definizione**: Lead che hai incontrato (era potenziale) ma non ha comprato. Non ha portato a una vendita.

---

## 📝 **LEADS**

**Definizione**: Prospetti commerciali, potenziali clienti in fase di contatto iniziale.

**Campi principali**:
- nome_lead: Nome del contatto
- azienda_lead: Azienda del lead
- consulente_assegnato: ID del consulente responsabile
- contatto_avvenuto: booleano (contattato/da contattare)

---

## 🎓 **CORSI**

**Definizione**: Corsi interaziendali organizzati dall'azienda.

**Tipologie**:
- **CorsiLeadership**: Uno dei corsi interaziendali (quanti clienti hai iscritto a corso leadership)
- Altri corsi del catalogo

**Impatto KPI**:
- Generano **VSD Indiretto**
- Contribuiscono al conteggio iscritti
- Distribuiti su più giorni in base alla durata

---

## 💼 **ALTRI TERMINI**

### **iProfile**
**Definizione**: Quanti iProfile hai venduto.

**Utilizzo**:
- Servizio specifico iProfile
- Ogni vendita conta come 1

### **MBS**
**Definizione**: Quanti clienti hai iscritto in MBS.

**Utilizzo**:
- KPI di conteggio
- Appare nei periodi

### **Telefonate**
**Definizione**: Quante telefonate a freddo per fissare appuntamenti prevedi di fare o hai fatto.

**Utilizzo**:
- KPI di conteggio
- Appare nei periodi
- Usato per sottoprodotti
- Target mensili:
  - Junior: 300
  - Senior: 0 (non specificato)

### **AppFissati (Appuntamenti Fissati)**
**Definizione**: Quanti appuntamenti hai fissato in quella sessione di giornata.

**Utilizzo**:
- KPI di conteggio
- Appare nei periodi
- Usato per sottoprodotti
- Conta gli appuntamenti fissati durante una sessione

### **AppFatti (Appuntamenti Fatti)**
**Definizione**: Quanti appuntamenti hai fatto in quella giornata (appuntamenti effettivamente svolti/completati).

**Target mensili**:
- Junior: 30
- Senior: 4

### **Sottoprodotti**
**Definizione**: Tutto ciò che precede la vendita. I sottoprodotti della vendita: fare appuntamenti, fare telefonate a freddo, fare visite a freddo, fissare appuntamenti, fare outbound mail o messaggi, ecc. È tutto ciò che un commerciale fa e precede la vendita.

**Utilizzo**:
- Tipo appuntamento con durata 4h
- Include: Telefonate, Appuntamenti fissati
- Non include VSS/VSD personali

### **CorsiLeadership**
**Definizione**: Quanti clienti hai iscritto a corso leadership. È uno dei corsi interaziendali (non tutti i corsi interaziendali sono leadership).

**Utilizzo**:
- KPI di conteggio
- Appare nei periodi
- Ogni cliente iscritto conta come 1

### **Target/Obiettivo**
**Definizione**: Sinonimi. Obiettivi di performance fissati nel BP previsionale.

**Utilizzo**:
- Target vengono definiti nel previsionale
- Confrontati con risultati nel consuntivo

### **Slot liberi/Disponibilità**
**Definizione**: Sinonimi. Indica quando un consulente ha tempo libero per nuovi appuntamenti.

**Utilizzo**:
- Chi ha MENO appuntamenti = ha PIÙ slot liberi/disponibilità
- Calcolato contando gli appuntamenti di un periodo

### **Leaderboard/Ranking**
**Definizione**: Classifica dei consulenti basata su performance (KPI) in un determinato periodo.

**Utilizzo**:
- Ordina i consulenti per valore di un indicatore specifico
- Può essere per singolo indicatore o overall (con pesi)

### **Aggregato**
**Definizione**: Dati aggregati di più consulenti (squadra/team).

**Utilizzo**:
- Gli admin possono vedere dati aggregati di tutti i consulenti
- Usato per analisi di squadra

### **Bag (Indicators Bag)**
**Definizione**: Contenitore che contiene tutti gli indicatori KPI di un periodo (indicatorsprev o indicatorscons).

**Utilizzo**:
- Ogni periodo ha un "bag" previsionale (indicatorsprev) e uno consuntivo (indicatorscons)
- Il bag contiene: VSS, VSDPersonale, VSDIndiretto, GI, NNCF, AppFatti, Telefonate, ecc.

---

## 🔄 **FLUSSI OPERATIVI**

### **Creazione Appuntamento → Cliente**
1. Utente crea appuntamento con cliente
2. Se cliente non esiste, viene creato automaticamente
3. Status iniziale: "potenziale" (se NNCF non selezionato) o "attivo" (se NNCF selezionato)

### **Appuntamento → NNCF**
1. Dopo appuntamento, viene mostrato banner per confermare vendita
2. Se confermata vendita: cliente diventa "attivo", appuntamento marcato NNCF=true
3. Se non confermata: cliente rimane "potenziale" o diventa "lead non chiuso"

### **BP Previsionale → Consuntivo**
1. All'inizio periodo: si crea BP previsionale con obiettivi
2. Durante il periodo: si inseriscono appuntamenti e dati
3. Alla fine periodo: si crea consuntivo con risultati effettivi

---

## 📌 **NOTE IMPORTANTI PER IL CHATBOT**

1. **Il chatbot deve spiegare questi termini quando richiesto**
2. **Deve aiutare gli utenti a capire come usare l'app**
3. **Deve guidare nella comprensione dei KPI e dei target**
4. **Deve spiegare le differenze tra previsionale e consuntivo**
5. **Deve chiarire il sistema di grade (junior/senior) e target associati**
6. **Deve aiutare a capire come funzionano le provvigioni**

