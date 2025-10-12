-- Migration: Create push_notifications_sent table for cross-device push tracking
-- This table tracks which push notifications have been sent to avoid duplicates

CREATE TABLE IF NOT EXISTS push_notifications_sent (
    id TEXT PRIMARY KEY,
    userid TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    appointmentid TEXT NOT NULL,
    notification_type TEXT NOT NULL, -- 'sale' or 'nncf'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_push_notifications_userid ON push_notifications_sent(userid);
CREATE INDEX IF NOT EXISTS idx_push_notifications_appointmentid ON push_notifications_sent(appointmentid);
CREATE INDEX IF NOT EXISTS idx_push_notifications_type ON push_notifications_sent(notification_type);

-- Create unique constraint to prevent duplicate notifications
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_notifications_unique 
    ON push_notifications_sent(userid, appointmentid, notification_type);

-- Add RLS (Row Level Security) policy
ALTER TABLE push_notifications_sent ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own notification records
CREATE POLICY "Users can access own push notifications" ON push_notifications_sent
    FOR ALL USING (userid = auth.uid()::text);

-- Add comment for documentation
COMMENT ON TABLE push_notifications_sent IS 'Tracks sent push notifications to prevent duplicates across devices';
COMMENT ON COLUMN push_notifications_sent.notification_type IS 'Type of notification: sale or nncf';
COMMENT ON COLUMN push_notifications_sent.appointmentid IS 'ID of the appointment that triggered the notification';
