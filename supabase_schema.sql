-- Enable gen_random_uuid
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- members
CREATE TABLE members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('outreach', 'dev', 'both')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- projects
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  deal_value numeric NOT NULL,
  status text NOT NULL CHECK (status IN ('scouting', 'confirmed', 'advance_received', 'in_dev', 'delivered', 'completed')),
  outreach_member_id uuid NOT NULL REFERENCES members(id),
  advance_received boolean NOT NULL DEFAULT false,
  balance_received boolean NOT NULL DEFAULT false,
  outreach_cut_pct numeric NOT NULL DEFAULT 10,
  dev_cut_pct numeric NOT NULL DEFAULT 15 CHECK (dev_cut_pct >= 10 AND dev_cut_pct <= 20),
  transport_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- project_devs
CREATE TABLE project_devs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id),
  share_pct numeric NOT NULL
);

-- payouts
CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id),
  payout_type text NOT NULL CHECK (payout_type IN ('outreach_cut', 'dev_cut', 'transport')),
  amount numeric NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- fund_transactions
CREATE TABLE fund_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('inflow', 'outflow')),
  amount numeric NOT NULL,
  description text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  covered_by text,
  transaction_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
