-- Migration 048: Project dimension + expose cost center / project on the
-- invoice header so their effect reaches journal entries and reports, as
-- requested. Mirrors the existing cost_centers structure exactly — no new
-- infrastructure beyond what's needed.

CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code        varchar(30),
  name        varchar(200) NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_company_idx ON projects (company_id);
CREATE UNIQUE INDEX IF NOT EXISTS projects_company_code_uq ON projects (company_id, code) WHERE code IS NOT NULL;

-- Invoice header: one cost center / project selection applied to the whole
-- invoice (and copied onto every line + journal line at posting time), so a
-- single invoice reads as belonging to one project/cost center without
-- forcing per-line selection.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS journal_entry_lines_project_idx ON journal_entry_lines (company_id, project_id);
