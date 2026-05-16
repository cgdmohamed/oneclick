-- Migration tracking table (DAT-03 baseline). The runner records every
-- successfully applied file; existing files are skipped on subsequent runs.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Public invoice access (TEN-02): SECURITY DEFINER function executed with
-- the table owner's privileges, so it bypasses tenant RLS for a single
-- well-defined lookup by public_id. No tenant context is required.
CREATE OR REPLACE FUNCTION public_get_invoice(p_public_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'invoice', to_jsonb(i.*)
      || jsonb_build_object(
        'client_name',     c.name,
        'client_email',    c.email,
        'client_phone',    c.phone,
        'client_tax',      c.tax_number,
        'company_name',    co.name,
        'company_tax',     co.tax_number,
        'company_address', co.address,
        'company_phone',   co.phone,
        'company_logo',    co.logo_url,
        'company_stamp',   co.stamp_url,
        'currency',        co.currency
      ),
    'items', COALESCE(
      (SELECT jsonb_agg(to_jsonb(ii.*) ORDER BY ii.created_at)
         FROM invoice_items ii WHERE ii.invoice_id = i.id),
      '[]'::jsonb)
  ) INTO result
  FROM invoices  i
  JOIN clients   c  ON c.id  = i.client_id
  JOIN companies co ON co.id = i.company_id
  WHERE i.public_id = p_public_id;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public_get_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_get_invoice(uuid) TO PUBLIC;
