import { z } from 'zod';
import { crudRouter } from '../../utils/crud.js';

const schema = z.object({
  name:      z.string().min(1),
  is_active: z.boolean().optional().default(true),
});

export default crudRouter({
  table:       'expense_categories',
  fields:      ['name', 'is_active'],
  schema,
  patchSchema: schema.partial(),
  list:        { orderBy: 'name ASC', searchable: ['name'] },
});
