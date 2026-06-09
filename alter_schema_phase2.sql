-- Phase 2 Schema Updates

-- 1. Create project_outreach junction table
CREATE TABLE project_outreach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id),
  share_pct numeric NOT NULL
);

-- 2. Migrate existing outreach members from projects table (if any)
INSERT INTO project_outreach (project_id, member_id, share_pct)
SELECT id, outreach_member_id, 100 FROM projects WHERE outreach_member_id IS NOT NULL;

-- 3. Create transport_expenses table
CREATE TABLE transport_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id),
  amount numeric NOT NULL,
  proof_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Remove outreach_member_id and transport_amount from projects table
ALTER TABLE projects DROP COLUMN outreach_member_id;
ALTER TABLE projects DROP COLUMN transport_amount;
