-- Migration 054: One-time cleanup for existing duplicate client records.
--
-- Going forward, saving a client with a phone number already used by
-- another client in the same company only shows a non-blocking warning
-- (Clients.tsx) — two clients can legitimately share a phone (e.g. a shared
-- office line), so duplicates are not prevented outright. This migration
-- consolidates any duplicates that already exist in the data: for every
-- group of clients in the same company sharing the same phone number
-- (compared after stripping all non-digit characters, so "010-1234567"
-- and "0101234567" count as the same number), the oldest record becomes
-- the survivor. Every table referencing the other records' client id is
-- re-pointed to the survivor, the survivor adopts a loser's supplier link
-- if it doesn't already have one of its own, and the duplicate rows are
-- then deleted.
--
-- This is a one-time data fix, not a recurring job. Runs once via the
-- normal migration runner.

DO $$
DECLARE
  grp RECORD;
  survivor_id uuid;
  loser_ids uuid[];
BEGIN
  FOR grp IN
    SELECT company_id,
           regexp_replace(phone, '\D', '', 'g') AS norm_phone,
           array_agg(id ORDER BY created_at ASC) AS ids
    FROM clients
    WHERE phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') <> ''
    GROUP BY company_id, regexp_replace(phone, '\D', '', 'g')
    HAVING COUNT(*) > 1
  LOOP
    survivor_id := grp.ids[1];
    loser_ids := grp.ids[2:array_length(grp.ids, 1)];

    UPDATE invoices SET client_id = survivor_id WHERE client_id = ANY(loser_ids);
    UPDATE credit_notes SET customer_id = survivor_id WHERE customer_id = ANY(loser_ids);
    UPDATE debit_notes SET customer_id = survivor_id WHERE customer_id = ANY(loser_ids);
    UPDATE doubtful_debt_allowances SET customer_id = survivor_id WHERE customer_id = ANY(loser_ids);
    UPDATE bad_debt_write_offs SET customer_id = survivor_id WHERE customer_id = ANY(loser_ids);
    UPDATE payments SET client_id = survivor_id WHERE client_id = ANY(loser_ids);
    UPDATE journal_entry_lines SET client_id = survivor_id WHERE client_id = ANY(loser_ids);

    -- Preserve a supplier link from a loser if the survivor doesn't have
    -- its own (clients_linked_supplier_uq allows at most one client per
    -- supplier, so at most one loser in the group can have a non-null value).
    UPDATE clients SET linked_supplier_id = (
      SELECT linked_supplier_id FROM clients WHERE id = ANY(loser_ids) AND linked_supplier_id IS NOT NULL LIMIT 1
    ) WHERE id = survivor_id AND linked_supplier_id IS NULL;

    DELETE FROM clients WHERE id = ANY(loser_ids);
  END LOOP;
END $$;
