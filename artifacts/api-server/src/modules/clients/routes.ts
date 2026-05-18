import { z } from 'zod';
import { crudRouter } from '../../utils/crud.js';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  tax_number: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  currency_symbol: z.string().optional().nullable(),
});

export default crudRouter({
  table: 'clients',
  fields: ['name','email','phone','tax_number','address','notes','currency','currency_symbol'],
  schema,
  patchSchema: schema.partial(),
  list: { orderBy: 'created_at DESC' },
});
