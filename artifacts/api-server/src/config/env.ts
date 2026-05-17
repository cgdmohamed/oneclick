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

  SMTP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, {
    message: 'SMTP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)',
  }).optional(),

  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  COOKIE_SECURE: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
  COOKIE_DOMAIN: z.string().optional(),
});

const parsed = schema.parse(process.env);

// Require SMTP_ENCRYPTION_KEY in production so the server fails fast rather
// than accepting SMTP passwords that can't be safely encrypted at rest.
if (parsed.NODE_ENV === 'production' && !parsed.SMTP_ENCRYPTION_KEY) {
  throw new Error(
    'SMTP_ENCRYPTION_KEY must be set in production (64 hex characters). ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  );
}

export const env = parsed;
export type Env = z.infer<typeof schema>;
