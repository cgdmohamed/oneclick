import { z } from 'zod';
import { crudRouter } from '../../utils/crud.js';

const schema = z.object({
  sku: z.string().optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price: z.coerce.number().nonnegative(),
  cost: z.coerce.number().nonnegative().default(0),
  quantity: z.coerce.number().int().default(0),
  alert_level: z.coerce.number().int().default(0),
  unit: z.string().default('قطعة'),
  image_url: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

export default crudRouter({
  table: 'products',
  fields: ['sku','name','description','price','cost','quantity','alert_level','unit','image_url','is_active'],
  schema,
  patchSchema: schema.partial(),
});
