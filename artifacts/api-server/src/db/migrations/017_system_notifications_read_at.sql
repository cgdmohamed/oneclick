-- Add read_at tracking to system_notifications so admins can mark them as read
ALTER TABLE system_notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
