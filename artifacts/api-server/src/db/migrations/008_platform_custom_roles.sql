-- 008: Platform custom roles table
-- Stores admin-defined roles with fine-grained permission sets.

CREATE TABLE IF NOT EXISTS platform_custom_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  color       VARCHAR(20),
  scope       VARCHAR(20) NOT NULL DEFAULT 'company',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
