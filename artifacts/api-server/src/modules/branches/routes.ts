import { z } from 'zod';
import { crudRouter } from '../../utils/crud.js';

const schema = z.object({
  code: z.string().max(30).optional().nullable(),
  name: z.string().min(1).max(200),
  address: z.string().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  is_active: z.boolean().default(true),
});

export default crudRouter({
  table: 'branches',
  fields: ['code', 'name', 'address', 'phone', 'is_active'],
  schema,
  patchSchema: schema.partial(),
  list: { orderBy: 'name ASC', searchable: ['code', 'name', 'phone'] },
});
