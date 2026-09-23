-- Migration 053: Link a client record to a supplier record when they are the
-- same real-world party (e.g. a wholesaler who both buys from and sells to
-- the company). This is purely a reporting link — it does NOT change how
-- invoices/purchase invoices post to the ledger (accounts receivable and
-- accounts payable remain separate accounts, which is standard accounting
-- practice; netting the two would require a deliberate journal entry, not an
-- automatic merge). It only enables a combined statement showing both sides
-- and a net balance for that party.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS linked_supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;

-- A supplier can be linked from at most one client record.
CREATE UNIQUE INDEX IF NOT EXISTS clients_linked_supplier_uq
  ON clients (linked_supplier_id) WHERE linked_supplier_id IS NOT NULL;
