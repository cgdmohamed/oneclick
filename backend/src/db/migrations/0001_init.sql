-- ============================================================
-- Hesabat Backend — Bootstrap migration (PostgreSQL 14+)
-- Creates schema, tables, enums, indexes, RLS policies, helpers.
-- Idempotent: safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

/* ---------- Enums ---------- */
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('super_admin','company_admin','accountant','sales','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft','sent','paid','partial','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('cash','bank','wallet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active','trialing','past_due','cancelled','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/* ---------- Core tables ---------- */
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           varchar(255) NOT NULL UNIQUE,
  password_hash   varchar(255) NOT NULL,
  name            varchar(120) NOT NULL,
  is_super_admin  boolean      NOT NULL DEFAULT false,
  email_verified_at timestamptz,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  varchar(200) NOT NULL,
  legal_name            varchar(200),
  tax_number            varchar(50),
  commercial_register   varchar(50),
  email                 varchar(255),
  phone                 varchar(30),
  address               text,
  logo_url              text,
  stamp_url             text,
  invoice_prefix        varchar(20)  NOT NULL DEFAULT 'INV',
  invoice_sequence      integer      NOT NULL DEFAULT 0,
  invoice_year_format   varchar(10)  NOT NULL DEFAULT 'full',
  invoice_padding       integer      NOT NULL DEFAULT 4,
  invoice_separator     varchar(5)   NOT NULL DEFAULT '-',
  currency              varchar(10)  NOT NULL DEFAULT 'SAR',
  vat_rate              numeric(5,2) NOT NULL DEFAULT 15.00,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_companies (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
  role        app_role NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_uq ON user_roles(user_id, company_id, role);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  varchar(255) NOT NULL,
  expires_at  timestamptz  NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  varchar(255) NOT NULL,
  expires_at  timestamptz  NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

/* ---------- Plans / Subscriptions ---------- */
CREATE TABLE IF NOT EXISTS plans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  varchar(50)  NOT NULL UNIQUE,
  name                  varchar(100) NOT NULL,
  price_monthly         numeric(10,2) NOT NULL DEFAULT 0,
  price_yearly          numeric(10,2) NOT NULL DEFAULT 0,
  max_users             integer NOT NULL DEFAULT 1,
  max_invoices_monthly  integer NOT NULL DEFAULT 50,
  features              jsonb   NOT NULL DEFAULT '{}'::jsonb,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id       uuid NOT NULL REFERENCES plans(id),
  status        subscription_status NOT NULL DEFAULT 'trialing',
  started_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_company_idx ON subscriptions(company_id);

CREATE TABLE IF NOT EXISTS feature_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_key varchar(100) NOT NULL,
  enabled     boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS feature_access_uq ON feature_access(plan_id, feature_key);

/* ---------- Tenant-scoped tables ---------- */
CREATE TABLE IF NOT EXISTS clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        varchar(200) NOT NULL,
  email       varchar(255),
  phone       varchar(30),
  tax_number  varchar(50),
  address     text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_company_idx ON clients(company_id);

CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku         varchar(50),
  name        varchar(200) NOT NULL,
  description text,
  price       numeric(12,2) NOT NULL DEFAULT 0,
  cost        numeric(12,2) NOT NULL DEFAULT 0,
  quantity    integer       NOT NULL DEFAULT 0,
  alert_level integer       NOT NULL DEFAULT 0,
  unit        varchar(20)   NOT NULL DEFAULT 'قطعة',
  is_active   boolean       NOT NULL DEFAULT true,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_company_idx ON products(company_id);

CREATE TABLE IF NOT EXISTS accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        varchar(120)  NOT NULL,
  type        account_type  NOT NULL DEFAULT 'cash',
  bank_name   varchar(120),
  iban        varchar(50),
  balance     numeric(14,2) NOT NULL DEFAULT 0,
  is_active   boolean       NOT NULL DEFAULT true,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounts_company_idx ON accounts(company_id);

CREATE TABLE IF NOT EXISTS invoices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number      varchar(50) NOT NULL,
  public_id   uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  issue_date  timestamptz NOT NULL DEFAULT now(),
  due_date    timestamptz,
  status      invoice_status NOT NULL DEFAULT 'draft',
  subtotal    numeric(14,2) NOT NULL DEFAULT 0,
  vat_amount  numeric(14,2) NOT NULL DEFAULT 0,
  discount    numeric(14,2) NOT NULL DEFAULT 0,
  total       numeric(14,2) NOT NULL DEFAULT 0,
  paid        numeric(14,2) NOT NULL DEFAULT 0,
  remaining   numeric(14,2) NOT NULL DEFAULT 0,
  notes       text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX        IF NOT EXISTS invoices_company_idx ON invoices(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_idx  ON invoices(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_uq   ON invoices(company_id, number);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES products(id) ON DELETE SET NULL,
  description varchar(300) NOT NULL,
  quantity    numeric(12,3) NOT NULL DEFAULT 1,
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate    numeric(5,2)  NOT NULL DEFAULT 15.00,
  line_total  numeric(14,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  account_id  uuid NOT NULL REFERENCES accounts(id),
  amount      numeric(14,2) NOT NULL,
  paid_at     timestamptz   NOT NULL DEFAULT now(),
  method      varchar(30)   NOT NULL DEFAULT 'cash',
  reference   varchar(100),
  notes       text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_company_idx ON payments(company_id);

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  title       varchar(200) NOT NULL,
  body        text,
  kind        varchar(30)  NOT NULL DEFAULT 'info',
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_company_idx ON notifications(company_id);

CREATE TABLE IF NOT EXISTS system_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      varchar(200) NOT NULL,
  body       text,
  audience   varchar(30)  NOT NULL DEFAULT 'all',
  created_at timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      varchar(100) NOT NULL,
  entity      varchar(50)  NOT NULL,
  entity_id   uuid,
  data        jsonb,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

/* ---------- Helper functions (SECURITY DEFINER) ---------- */
CREATE OR REPLACE FUNCTION current_company() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_company', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION current_app_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION has_role(_user_id uuid, _company_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND (company_id = _company_id OR (_company_id IS NULL AND company_id IS NULL))
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = _user_id AND is_super_admin = true)
$$;

/* ---------- Row Level Security ---------- */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','products','accounts','invoices','invoice_items',
    'payments','notifications','subscriptions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
      USING (company_id = current_company() OR is_super_admin(current_app_user()))
      WITH CHECK (company_id = current_company() OR is_super_admin(current_app_user()))
    $p$, t);
  END LOOP;
END $$;

/* updated_at trigger */
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','companies','clients','products','accounts',
    'invoices','invoice_items','payments','notifications'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;
