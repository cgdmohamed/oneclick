-- Migration 000: Full initial schema for Hesabat / ون كليك
-- All statements use IF NOT EXISTS / OR REPLACE so this file is fully idempotent
-- and safe to re-run against a database that was already set up.

-- =====================================================================
-- Enums
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM (
    'super_admin', 'company_admin', 'accountant', 'sales', 'viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM (
    'draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('cash', 'bank', 'wallet');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'active', 'trialing', 'past_due', 'cancelled', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM (
    'pending', 'accepted', 'revoked', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================================
-- Core tables
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             varchar(255) NOT NULL UNIQUE,
  password_hash     varchar(255) NOT NULL,
  name              varchar(120) NOT NULL,
  is_super_admin    boolean     NOT NULL DEFAULT false,
  onboarding_done   boolean     NOT NULL DEFAULT false,
  email_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 varchar(200) NOT NULL,
  legal_name           varchar(200),
  tax_number           varchar(50),
  commercial_register  varchar(50),
  email                varchar(255),
  phone                varchar(30),
  address              text,
  logo_url             text,
  stamp_url            text,
  invoice_prefix       varchar(20)  NOT NULL DEFAULT 'INV',
  invoice_sequence     integer      NOT NULL DEFAULT 0,
  invoice_year_format  varchar(10)  NOT NULL DEFAULT 'full',
  invoice_padding      integer      NOT NULL DEFAULT 4,
  invoice_separator    varchar(5)   NOT NULL DEFAULT '-',
  currency             varchar(10)  NOT NULL DEFAULT 'SAR',
  vat_rate             numeric(5,2) NOT NULL DEFAULT 15.00,
  smtp_settings        jsonb,
  is_active            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_companies (
  user_id    uuid        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  is_default boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id         uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid     NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  company_id uuid     REFERENCES companies(id)          ON DELETE CASCADE,
  role       app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_uq ON user_roles (user_id, company_id, role);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  varchar(255) NOT NULL,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  family_id   uuid,
  replaced_by uuid,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(255) NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- Plans / Subscriptions (system-wide)
-- =====================================================================

CREATE TABLE IF NOT EXISTS plans (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 varchar(50)  NOT NULL UNIQUE,
  name                 varchar(100) NOT NULL,
  price_monthly        numeric(10,2) NOT NULL DEFAULT 0,
  price_yearly         numeric(10,2) NOT NULL DEFAULT 0,
  max_users            integer      NOT NULL DEFAULT 1,
  max_invoices_monthly integer      NOT NULL DEFAULT 50,
  features             jsonb        NOT NULL DEFAULT '{}',
  is_active            boolean      NOT NULL DEFAULT true,
  created_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id           uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid                NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id      uuid                NOT NULL REFERENCES plans(id),
  status       subscription_status NOT NULL DEFAULT 'trialing',
  started_at   timestamptz         NOT NULL DEFAULT now(),
  expires_at   timestamptz,
  cancelled_at timestamptz,
  created_at   timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_company_idx ON subscriptions (company_id);

CREATE TABLE IF NOT EXISTS feature_access (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid        NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_key varchar(100) NOT NULL,
  enabled     boolean     NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS feature_access_uq ON feature_access (plan_id, feature_key);

-- =====================================================================
-- Tenant-scoped tables
-- =====================================================================

CREATE TABLE IF NOT EXISTS clients (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       varchar(200) NOT NULL,
  email      varchar(255),
  phone      varchar(30),
  tax_number varchar(50),
  address    text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clients_company_idx ON clients (company_id);

CREATE TABLE IF NOT EXISTS products (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku         varchar(50),
  name        varchar(200) NOT NULL,
  description text,
  image_url   text,
  price       numeric(12,2) NOT NULL DEFAULT 0,
  cost        numeric(12,2) NOT NULL DEFAULT 0,
  quantity    integer      NOT NULL DEFAULT 0,
  alert_level integer      NOT NULL DEFAULT 0,
  unit        varchar(20)  NOT NULL DEFAULT 'قطعة',
  is_active   boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_company_idx ON products (company_id);

CREATE TABLE IF NOT EXISTS accounts (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       varchar(120) NOT NULL,
  type       account_type NOT NULL DEFAULT 'cash',
  bank_name  varchar(120),
  iban       varchar(50),
  balance    numeric(14,2) NOT NULL DEFAULT 0,
  is_active  boolean      NOT NULL DEFAULT true,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_company_idx ON accounts (company_id);

CREATE TABLE IF NOT EXISTS invoices (
  id         uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid           NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number     varchar(50)    NOT NULL,
  public_id  uuid           NOT NULL DEFAULT gen_random_uuid(),
  client_id  uuid           NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  issue_date timestamptz    NOT NULL DEFAULT now(),
  due_date   timestamptz,
  status     invoice_status NOT NULL DEFAULT 'draft',
  subtotal   numeric(14,2)  NOT NULL DEFAULT 0,
  vat_amount numeric(14,2)  NOT NULL DEFAULT 0,
  discount   numeric(14,2)  NOT NULL DEFAULT 0,
  total      numeric(14,2)  NOT NULL DEFAULT 0,
  paid       numeric(14,2)  NOT NULL DEFAULT 0,
  remaining  numeric(14,2)  NOT NULL DEFAULT 0,
  notes      text,
  created_by uuid           REFERENCES users(id),
  created_at timestamptz    NOT NULL DEFAULT now(),
  updated_at timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_company_idx ON invoices (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_idx ON invoices (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_uq ON invoices (company_id, number);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id  uuid         NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id  uuid         REFERENCES products(id) ON DELETE SET NULL,
  description varchar(300) NOT NULL,
  quantity    numeric(12,3) NOT NULL DEFAULT 1,
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate    numeric(5,2)  NOT NULL DEFAULT 15.00,
  line_total  numeric(14,2) NOT NULL DEFAULT 0,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items (invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  account_id uuid        NOT NULL REFERENCES accounts(id),
  amount     numeric(14,2) NOT NULL,
  paid_at    timestamptz NOT NULL DEFAULT now(),
  method     varchar(30) NOT NULL DEFAULT 'cash',
  reference  varchar(100),
  notes      text,
  created_by uuid        REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS payments_company_idx ON payments (company_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES users(id) ON DELETE CASCADE,
  title      varchar(200) NOT NULL,
  body       text,
  kind       varchar(30) NOT NULL DEFAULT 'info',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_company_idx ON notifications (company_id);

CREATE TABLE IF NOT EXISTS system_notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      varchar(200) NOT NULL,
  body       text,
  audience   varchar(30) NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        REFERENCES companies(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  action     varchar(100) NOT NULL,
  entity     varchar(50)  NOT NULL,
  entity_id  uuid,
  data       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid              NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email            varchar(255)      NOT NULL,
  full_name        varchar(120)      NOT NULL,
  phone            varchar(30),
  role             app_role          NOT NULL,
  token_hash       varchar(64)       NOT NULL UNIQUE,
  invited_by       uuid              REFERENCES users(id) ON DELETE SET NULL,
  invited_at       timestamptz       NOT NULL DEFAULT now(),
  expires_at       timestamptz       NOT NULL,
  status           invitation_status NOT NULL DEFAULT 'pending',
  accepted_at      timestamptz,
  accepted_user_id uuid              REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS invitations_company_idx ON invitations (company_id, invited_at);

-- =====================================================================
-- File uploads
-- =====================================================================

CREATE TABLE IF NOT EXISTS uploads (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  filename   varchar(255) NOT NULL,
  mime_type  varchar(100) NOT NULL,
  size       integer     NOT NULL DEFAULT 0,
  url        text        NOT NULL DEFAULT '',
  kind       varchar(30) NOT NULL DEFAULT 'attachment',
  is_public  boolean     NOT NULL DEFAULT false,
  disk_name  varchar(255),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uploads_company_idx ON uploads (company_id);

-- =====================================================================
-- Platform (super-admin billing)
-- =====================================================================

CREATE TABLE IF NOT EXISTS platform_wallets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       varchar(120) NOT NULL,
  type       varchar(20) NOT NULL DEFAULT 'cash',
  balance    numeric(14,2) NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  wallet_id       uuid        NOT NULL REFERENCES platform_wallets(id),
  amount          numeric(14,2) NOT NULL,
  method          varchar(30) NOT NULL DEFAULT 'cash',
  paid_at         timestamptz NOT NULL DEFAULT now(),
  reference       varchar(100),
  notes           text,
  recorded_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_payments_subscription_idx ON subscription_payments (subscription_id);
CREATE INDEX IF NOT EXISTS sub_payments_wallet_idx       ON subscription_payments (wallet_id);

CREATE TABLE IF NOT EXISTS platform_settings (
  key        varchar(100) PRIMARY KEY,
  value      jsonb        NOT NULL DEFAULT '{}',
  updated_at timestamptz  NOT NULL DEFAULT now()
);
