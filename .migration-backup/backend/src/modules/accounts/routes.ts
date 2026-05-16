import { z } from 'zod';
import { crudRouter } from '../../utils/crud.js';

const schema = z.object({
  name: z.string().min(1),
  type: z.enum(['cash','bank','wallet']).default('cash'),
  bank_name: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  balance: z.coerce.number().default(0),
  is_active: z.boolean().default(true),
});

export default crudRouter({
  table: 'accounts',
  fields: ['name','type','bank_name','iban','balance','is_active'],
  schema,
  patchSchema: schema.partial(),
});
