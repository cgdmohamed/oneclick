-- Internal, append-only record of sensitive actions taken by super-admin
-- accounts. Deliberately NOT exposed through any API route or UI screen —
-- there is no GET endpoint for it anywhere in the app, by design. Viewable
-- only via direct database access (psql).
--
-- Unlike `audit_log` (company_id REFERENCES companies(id) ON DELETE CASCADE,
-- user_id REFERENCES users(id) ON DELETE SET NULL), this table has NO
-- foreign keys on actor/target ids at all, so a row survives even if the
-- company or user it refers to is later deleted. Identifying details
-- (email/name/label) are snapshotted into the row at write time for the
-- same reason — a later join against companies/users could come back empty.
CREATE TABLE IF NOT EXISTS internal_admin_actions_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID,
  actor_email   TEXT,
  actor_name    TEXT,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     UUID,
  target_label  TEXT,
  details       JSONB,
  request_id    TEXT,
  request_ip    TEXT
);

CREATE INDEX IF NOT EXISTS internal_admin_actions_log_time_idx ON internal_admin_actions_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS internal_admin_actions_log_actor_idx ON internal_admin_actions_log (actor_user_id);
CREATE INDEX IF NOT EXISTS internal_admin_actions_log_target_idx ON internal_admin_actions_log (target_id);
