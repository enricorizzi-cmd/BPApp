-- Migration: Create cycle_notifications_sent table for cycle deadline notification tracking
-- This table tracks which cycle deadline notifications have been sent to avoid duplicates

CREATE TABLE IF NOT EXISTS cycle_notifications_sent (
    id TEXT PRIMARY KEY,
    cycle_id TEXT NOT NULL,
    deadline TEXT NOT NULL,
    consultant_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_cycle_notifications_cycle_id ON cycle_notifications_sent(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycle_notifications_consultant_id ON cycle_notifications_sent(consultant_id);
CREATE INDEX IF NOT EXISTS idx_cycle_notifications_deadline ON cycle_notifications_sent(deadline);

-- Create unique constraint to prevent duplicate notifications
CREATE UNIQUE INDEX IF NOT EXISTS idx_cycle_notifications_unique 
    ON cycle_notifications_sent(cycle_id, deadline);

-- Add RLS (Row Level Security) policy
ALTER TABLE cycle_notifications_sent ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own cycle notification records
CREATE POLICY "Users can access own cycle notifications" ON cycle_notifications_sent
    FOR ALL USING (consultant_id = auth.uid()::text);

-- Add comment for documentation
COMMENT ON TABLE cycle_notifications_sent IS 'Tracks sent cycle deadline notifications to prevent duplicates';
COMMENT ON COLUMN cycle_notifications_sent.deadline IS 'ISO string of the deadline that triggered the notification';
COMMENT ON COLUMN cycle_notifications_sent.cycle_id IS 'ID of the cycle that has the deadline';
