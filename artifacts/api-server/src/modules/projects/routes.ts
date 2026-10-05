import { z } from 'zod';
import { crudRouter } from '../../utils/crud.js';

const schema = z.object({
  code: z.string().max(30).optional().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

export default crudRouter({
  table: 'projects',
  fields: ['code', 'name', 'description', 'is_active'],
  schema,
  patchSchema: schema.partial(),
  list: { orderBy: 'name ASC', searchable: ['code', 'name'] },
  // FKs from these tables to projects are ON DELETE SET NULL (migration
  // 048) — without this guard, deleting a project in use silently strips
  // it off historical invoices/journal lines.
  deleteGuardTables: [
    { table: 'invoices', column: 'project_id' },
    { table: 'invoice_items', column: 'project_id' },
    { table: 'journal_entry_lines', column: 'project_id' },
  ],
});
