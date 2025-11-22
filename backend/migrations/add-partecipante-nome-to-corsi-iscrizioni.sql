-- Migration: Add partecipante_nome to corsi_iscrizioni table
-- Description: Add field to store participant name (person attending the course) for intercompany course enrollments

ALTER TABLE corsi_iscrizioni
ADD COLUMN IF NOT EXISTS partecipante_nome TEXT;

-- Add comment
COMMENT ON COLUMN corsi_iscrizioni.partecipante_nome IS 'Nome e cognome del partecipante al corso (persona fisica che partecipa, distinta dall''azienda cliente)';

