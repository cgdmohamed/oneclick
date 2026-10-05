import { z } from 'zod';
import { crudRouter } from '../../utils/crud.js';

const schema = z.object({
  code: z.string().max(30).optional().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

export default crudRouter({
  table: 'cost_centers',
  fields: ['code', 'name', 'description', 'is_active'],
  schema,
  patchSchema: schema.partial(),
  list: { orderBy: 'name ASC', searchable: ['code', 'name'] },
  // All FKs from these tables to cost_centers are ON DELETE SET NULL (see
  // migrations 031/036/037/040) — without this guard, deleting a cost center
  // in use silently strips it off historical journal lines/invoices/etc.
  deleteGuardTables: [
    { table: 'journal_entry_lines', column: 'cost_center_id' },
    { table: 'payouts', column: 'cost_center_id' },
    { table: 'invoice_items', column: 'cost_center_id' },
    { table: 'purchase_invoice_items', column: 'cost_center_id' },
    { table: 'payroll_run_lines', column: 'cost_center_id' },
    { table: 'fixed_assets', column: 'cost_center_id' },
    { table: 'inventory_write_offs', column: 'cost_center_id' },
  ],
});
