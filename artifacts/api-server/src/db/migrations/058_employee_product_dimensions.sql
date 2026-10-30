-- Migration 058: employee/product dimensions on journal entry lines.
--
-- Mirrors journal_entry_lines.client_id (047_invoice_audit_fields_and_client_subledger.sql):
-- every employee currently shares one "مستحقات الموظفين" control account and
-- every product shares one "المخزون" control account, with no column to
-- filter a single employee's or a single product's own debit/credit
-- history out of the general ledger. Adding these lets the posting paths
-- below tag their lines, and the new per-employee/per-product statement
-- endpoints filter directly on journal_entry_lines without needing to
-- reconstruct the party through source-document joins the way the
-- customer/supplier ledgers have to.
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS journal_entry_lines_employee_idx ON journal_entry_lines (company_id, employee_id);
CREATE INDEX IF NOT EXISTS journal_entry_lines_product_idx ON journal_entry_lines (company_id, product_id);
