import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(8080),
  CORS_ORIGIN: z.string().default('same-origin'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  RUN_JOBS: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .default('true'),

  PG_POOL_MAX: z.coerce.number().int().positive().default(10),
  PG_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
  PG_CONNECT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(10_000),

  APP_URL: z.string().default('http://localhost:5173'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_SECURE: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
  COOKIE_DOMAIN: z.string().optional(),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
