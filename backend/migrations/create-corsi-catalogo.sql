-- Migration: Create corsi_catalogo table
-- Description: Course catalog - master data for all available courses

CREATE TABLE IF NOT EXISTS corsi_catalogo (
    id TEXT PRIMARY KEY,
    codice_corso TEXT NOT NULL, -- Internal course code (not unique, can be duplicated)
    nome_corso TEXT NOT NULL, -- Full course name
    descrizione TEXT, -- Course description
    durata_giorni INTEGER NOT NULL CHECK (durata_giorni > 0), -- Course duration in days (must be > 0)
    costo_corso DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (costo_corso >= 0), -- Base course cost (VSD Indirect) - can be 0
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_corsi_catalogo_id ON corsi_catalogo(id);
CREATE INDEX IF NOT EXISTS idx_corsi_catalogo_codice_corso ON corsi_catalogo(codice_corso);
CREATE INDEX IF NOT EXISTS idx_corsi_catalogo_nome_corso ON corsi_catalogo(nome_corso);

-- Enable Row Level Security
ALTER TABLE corsi_catalogo ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admin: full access
CREATE POLICY "admin_full_access" ON corsi_catalogo
    FOR ALL USING (auth.uid()::text IN (SELECT id FROM app_users WHERE role = 'admin'));

-- Consultant: read-only access
CREATE POLICY "consultant_read_only" ON corsi_catalogo
    FOR SELECT USING (auth.uid()::text IN (SELECT id FROM app_users WHERE role = 'consultant'));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_corsi_catalogo_updatedat()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_corsi_catalogo_updatedat
    BEFORE UPDATE ON corsi_catalogo
    FOR EACH ROW
    EXECUTE FUNCTION update_corsi_catalogo_updatedat();

-- Add comment
COMMENT ON TABLE corsi_catalogo IS 'Course catalog - master data for all available courses';
COMMENT ON COLUMN corsi_catalogo.codice_corso IS 'Internal course code (not unique, can be duplicated)';
COMMENT ON COLUMN corsi_catalogo.nome_corso IS 'Full course name';
COMMENT ON COLUMN corsi_catalogo.descrizione IS 'Course description';
COMMENT ON COLUMN corsi_catalogo.durata_giorni IS 'Course duration in days (must be > 0)';
COMMENT ON COLUMN corsi_catalogo.costo_corso IS 'Base course cost (VSD Indirect) - can be 0';
