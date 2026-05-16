-- Migration 001: public_get_invoice(uuid) → jsonb
-- SECURITY DEFINER so callers need no tenant context (no SET LOCAL required).
-- Used by /api/public/invoices/:publicId to serve public invoice data + PDFs.
CREATE OR REPLACE FUNCTION public_get_invoice(p_public_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_company record;
  v_client  record;
  v_items   jsonb;
BEGIN
  SELECT i.id, i.number, i.public_id, i.issue_date, i.due_date,
         i.status, i.subtotal, i.vat_amount, i.discount,
         i.total, i.paid, i.remaining, i.notes,
         i.company_id, i.client_id
  INTO v_invoice
  FROM invoices i
  WHERE i.public_id = p_public_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT c.name, c.email, c.phone, c.address,
         c.logo_url, c.stamp_url, c.tax_number, c.currency
  INTO v_company
  FROM companies c WHERE c.id = v_invoice.company_id;

  SELECT cl.name, cl.email, cl.phone, cl.tax_number
  INTO v_client
  FROM clients cl WHERE cl.id = v_invoice.client_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'description', ii.description,
      'quantity',    ii.quantity,
      'unit_price',  ii.unit_price,
      'vat_rate',    ii.vat_rate,
      'line_total',  ii.line_total,
      'created_at',  ii.created_at
    ) ORDER BY ii.created_at
  )
  INTO v_items
  FROM invoice_items ii
  WHERE ii.invoice_id = v_invoice.id;

  RETURN jsonb_build_object(
    'invoice', jsonb_build_object(
      'id',             v_invoice.id,
      'number',         v_invoice.number,
      'issue_date',     v_invoice.issue_date,
      'due_date',       v_invoice.due_date,
      'status',         v_invoice.status,
      'subtotal',       v_invoice.subtotal,
      'vat_amount',     v_invoice.vat_amount,
      'discount',       v_invoice.discount,
      'total',          v_invoice.total,
      'paid',           v_invoice.paid,
      'remaining',      v_invoice.remaining,
      'notes',          v_invoice.notes,
      'client_name',    v_client.name,
      'client_email',   v_client.email,
      'client_phone',   v_client.phone,
      'client_tax',     v_client.tax_number,
      'company_name',   v_company.name,
      'company_address',v_company.address,
      'company_tax',    v_company.tax_number,
      'company_phone',  v_company.phone,
      'company_logo',   v_company.logo_url,
      'company_stamp',  v_company.stamp_url,
      'currency',       v_company.currency
    ),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;
