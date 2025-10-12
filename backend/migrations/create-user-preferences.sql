-- Migration: Create user_preferences table for cross-device synchronization
-- This table stores user preferences that should be synchronized across all devices

CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY,
    userid TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}',
    createdat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient user lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_userid ON user_preferences(userid);

-- Create unique constraint to ensure one preferences record per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_unique_user ON user_preferences(userid);

-- Add RLS (Row Level Security) policy
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own preferences
CREATE POLICY "Users can access own preferences" ON user_preferences
    FOR ALL USING (userid = auth.uid()::text);

-- Add trigger to update updatedat timestamp
CREATE OR REPLACE FUNCTION update_user_preferences_updatedat()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updatedat = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_preferences_updatedat
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_preferences_updatedat();

-- Insert default preferences for existing users
INSERT INTO user_preferences (id, userid, preferences)
SELECT 
    'pref_' || id,
    id,
    '{
        "profile": {
            "name": "' || name || '",
            "role": "' || role || '",
            "grade": "' || grade || '"
        },
        "ui": {
            "sidebarCollapsed": false,
            "defaultPeriod": "mensile",
            "theme": "auto"
        },
        "notifications": {
            "enabled": true,
            "pushEnabled": true,
            "emailEnabled": true
        },
        "work": {
            "timezone": "Europe/Rome",
            "workingHours": {
                "start": "09:00",
                "end": "18:00"
            }
        }
    }'::jsonb
FROM app_users
WHERE NOT EXISTS (
    SELECT 1 FROM user_preferences WHERE userid = app_users.id
);

-- Add comment for documentation
COMMENT ON TABLE user_preferences IS 'User preferences synchronized across all devices';
COMMENT ON COLUMN user_preferences.preferences IS 'JSON object containing user preferences (profile, ui, notifications, work settings)';
