-- Add columns to backhaul_requests for server-side refresh and notification tracking
-- Run this migration in your Supabase SQL editor

-- Store the previous top match info for change detection
ALTER TABLE backhaul_requests
ADD COLUMN IF NOT EXISTS last_top_match_id TEXT,
ADD COLUMN IF NOT EXISTS last_top_match_revenue DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS last_server_refresh_at TIMESTAMPTZ;

-- Add index for efficient cron job queries
CREATE INDEX IF NOT EXISTS idx_backhaul_requests_auto_refresh
ON backhaul_requests (status, auto_refresh, next_refresh_at)
WHERE status = 'active' AND auto_refresh = true;

-- Comment explaining the columns
COMMENT ON COLUMN backhaul_requests.last_top_match_id IS 'Load ID of the previous top match (for change detection)';
COMMENT ON COLUMN backhaul_requests.last_top_match_revenue IS 'Revenue of the previous top match (for price change detection)';
COMMENT ON COLUMN backhaul_requests.last_server_refresh_at IS 'Timestamp of the last server-side refresh';
