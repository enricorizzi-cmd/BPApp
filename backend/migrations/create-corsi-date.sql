-- Migration: Create corsi_date table
-- Description: Course dates - scheduled sessions for courses

CREATE TABLE IF NOT EXISTS corsi_date (
    id TEXT PRIMARY KEY,
    corso_id TEXT NOT NULL REFERENCES corsi_catalogo(id) ON DELETE RESTRICT, -- Reference to course in catalog
    data_inizio DATE NOT NULL, -- Start date of the course session (first day)
    giorni_dettaglio JSONB NOT NULL DEFAULT '[]'::jsonb, -- JSONB array with all days details: [{"giorno":1,"data":"2025-01-15","ora_inizio":"09:00","ora_fine":"17:00"}]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_corsi_date_id ON corsi_date(id);
CREATE INDEX IF NOT EXISTS idx_corsi_date_corso_id ON corsi_date(corso_id);
CREATE INDEX IF NOT EXISTS idx_corsi_date_data_inizio ON corsi_date(data_inizio);

-- Enable Row Level Security
ALTER TABLE corsi_date ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admin: full access
CREATE POLICY "admin_full_access" ON corsi_date
    FOR ALL USING (auth.uid()::text IN (SELECT id FROM app_users WHERE role = 'admin'));

-- Consultant: read-only access
CREATE POLICY "consultant_read_only" ON corsi_date
    FOR SELECT USING (auth.uid()::text IN (SELECT id FROM app_users WHERE role = 'consultant'));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_corsi_date_updatedat()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_corsi_date_updatedat
    BEFORE UPDATE ON corsi_date
    FOR EACH ROW
    EXECUTE FUNCTION update_corsi_date_updatedat();

-- Add comment
COMMENT ON TABLE corsi_date IS 'Course dates - scheduled sessions for courses';
COMMENT ON COLUMN corsi_date.corso_id IS 'Reference to course in catalog';
COMMENT ON COLUMN corsi_date.data_inizio IS 'Start date of the course session (first day)';
COMMENT ON COLUMN corsi_date.giorni_dettaglio IS 'JSONB array with all days details: [{"giorno":1,"data":"2025-01-15","ora_inizio":"09:00","ora_fine":"17:00"}]';
