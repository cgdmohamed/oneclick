-- Manual subscription billing: platform-owned wallets + subscription payments.
-- No Stripe / Paddle integration. Super admins record payments by hand.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS amount numeric(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS platform_wallets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(120) NOT NULL,
  type        varchar(20)  NOT NULL DEFAULT 'cash', -- cash | bank | wallet
  balance     numeric(14,2) NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  wallet_id       uuid NOT NULL REFERENCES platform_wallets(id),
  amount          numeric(14,2) NOT NULL,
  method          varchar(30)   NOT NULL DEFAULT 'cash',
  paid_at         timestamptz   NOT NULL DEFAULT now(),
  reference       varchar(120),
  notes           text,
  recorded_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_payments_sub_idx
  ON subscription_payments(subscription_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS subscription_payments_wallet_idx
  ON subscription_payments(wallet_id, paid_at DESC);
