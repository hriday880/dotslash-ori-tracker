-- Run this in your Supabase SQL Editor

-- 1. Add closed_at column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- 2. Retroactively set closed_at for projects that are already past the 'advance_received' stage
UPDATE projects 
SET closed_at = created_at 
WHERE status IN ('advance_received', 'in_dev', 'delivered', 'completed')
AND closed_at IS NULL;
