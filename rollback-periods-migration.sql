-- SCRIPT DI ROLLBACK PER LA MIGRAZIONE PERIODI
-- Usa questo script se hai bisogno di tornare indietro

-- ATTENZIONE: Questo script ripristina i dati allo stato precedente alla migrazione
-- Le colonne year, week, month, quarter, semester torneranno NULL

-- 1. Ripristina i dati dalla tabella di backup
TRUNCATE periods;
INSERT INTO periods SELECT * FROM periods_backup_20250119_143000;

-- 2. Verifica che il rollback sia andato a buon fine
SELECT 
  COUNT(*) as total_records,
  COUNT(year) as year_populated,
  COUNT(week) as week_populated,
  COUNT(month) as month_populated,
  COUNT(quarter) as quarter_populated,
  COUNT(semester) as semester_populated
FROM periods;

-- 3. Controlla il caso specifico di Enrico Rizzi
SELECT 
  id,
  type,
  startdate,
  enddate,
  year,
  week,
  month,
  quarter,
  indicatorsprev->>'VSS' as vss_prev,
  indicatorscons->>'VSS' as vss_cons
FROM periods 
WHERE userid = 'r921wb8aypyyp2y0' 
  AND startdate >= '2025-10-01'
ORDER BY startdate;
