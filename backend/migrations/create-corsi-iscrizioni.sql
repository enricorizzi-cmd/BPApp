-- Migration: Create corsi_iscrizioni table
-- Description: Course enrollments - client registrations for course dates

CREATE TABLE IF NOT EXISTS corsi_iscrizioni (
    id TEXT PRIMARY KEY,
    corso_data_id TEXT NOT NULL REFERENCES corsi_date(id) ON DELETE RESTRICT, -- Reference to specific course date session
    cliente_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT, -- Client ID (denormalized for performance)
    cliente_nome TEXT NOT NULL, -- Client name (denormalized for performance)
    consulente_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT, -- Consultant ID (from client)
    consulente_nome TEXT NOT NULL, -- Consultant name (denormalized for performance)
    costo_personalizzato DECIMAL(10,2) NOT NULL CHECK (costo_personalizzato >= 0), -- Custom cost for this enrollment (can differ from base course cost)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_corsi_iscrizioni_id ON corsi_iscrizioni(id);
CREATE INDEX IF NOT EXISTS idx_corsi_iscrizioni_corso_data_id ON corsi_iscrizioni(corso_data_id);
CREATE INDEX IF NOT EXISTS idx_corsi_iscrizioni_cliente_id ON corsi_iscrizioni(cliente_id);
CREATE INDEX IF NOT EXISTS idx_corsi_iscrizioni_consultant_id ON corsi_iscrizioni(consulente_id);

-- Enable Row Level Security
ALTER TABLE corsi_iscrizioni ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admin: full access
CREATE POLICY "admin_full_access" ON corsi_iscrizioni
    FOR ALL USING (auth.uid()::text IN (SELECT id FROM app_users WHERE role = 'admin'));

-- Consultant: read-only access and modify own enrollments
CREATE POLICY "consultant_access" ON corsi_iscrizioni
    FOR ALL USING (auth.uid()::text = consulente_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_corsi_iscrizioni_updatedat()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_corsi_iscrizioni_updatedat
    BEFORE UPDATE ON corsi_iscrizioni
    FOR EACH ROW
    EXECUTE FUNCTION update_corsi_iscrizioni_updatedat();

-- Add comment
COMMENT ON TABLE corsi_iscrizioni IS 'Course enrollments - client registrations for course dates';
COMMENT ON COLUMN corsi_iscrizioni.corso_data_id IS 'Reference to specific course date session';
COMMENT ON COLUMN corsi_iscrizioni.cliente_id IS 'Client ID (denormalized for performance)';
COMMENT ON COLUMN corsi_iscrizioni.cliente_nome IS 'Client name (denormalized for performance)';
COMMENT ON COLUMN corsi_iscrizioni.consulente_id IS 'Consultant ID (from client)';
COMMENT ON COLUMN corsi_iscrizioni.consulente_nome IS 'Consultant name (denormalized for performance)';
COMMENT ON COLUMN corsi_iscrizioni.costo_personalizzato IS 'Custom cost for this enrollment (can differ from base course cost)';
