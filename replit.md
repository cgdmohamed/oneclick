# Hesabat / ون كليك

Arabic-first multi-tenant SaaS accounting platform. Companies can issue invoices, track payments, manage clients, products, accounts, and inventory — all in RTL Arabic UI.

## Run & Operate

- Frontend (Vite/React): `artifacts/hesabat` — workflow `artifacts/hesabat: web` (port 18627, proxied to `/`)
- API Server (Express): `artifacts/api-server` — workflow `artifacts/api-server: API Server` (port 8080)
- `pnpm --filter @workspace/db run push` — push Drizzle schema changes to the DB (dev only, not for production)
- Required env: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `VITE_API_URL=same-origin`

### Environment variables (production)

Copy `env.production.example` (project root) to `env.production` and fill in real values — `ecosystem.config.cjs` loads it automatically when PM2 starts the API server. Never commit `env.production`; it contains secrets.

```bash
cp env.production.example env.production
# Edit env.production, then:
pm2 start ecosystem.config.cjs --env production
```

Required keys (the server will refuse to start without them):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | ≥ 32 chars, random |
| `JWT_REFRESH_SECRET` | ≥ 32 chars, different from JWT_SECRET |
| `APP_URL` | Public URL (used in email links) |
| `SMTP_ENCRYPTION_KEY` | Exactly 64 hex chars — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

See `env.production.example` for all optional variables and their defaults.

### SMTP password back-fill (one-time, production)

Any company that saved an SMTP password before encryption was introduced has it stored as plaintext. Run this script once to encrypt all such rows:

```bash
# 1. Dry-run first — prints what would change, writes nothing
DRY_RUN=true \
  DATABASE_URL=<prod_connection_string> \
  SMTP_ENCRYPTION_KEY=<64-hex-chars> \
  node artifacts/api-server/scripts/encrypt-smtp-passwords.mjs

# 2. Apply for real
DATABASE_URL=<prod_connection_string> \
  SMTP_ENCRYPTION_KEY=<64-hex-chars> \
  node artifacts/api-server/scripts/encrypt-smtp-passwords.mjs
```

- The script is idempotent — already-encrypted rows (`enc:v1:` prefix) are skipped automatically.
- `SMTP_ENCRYPTION_KEY` must be the same 64-hex-char key the server uses so the API can decrypt passwords afterwards.
- Safe to re-run at any time; running it again after all rows are encrypted is a no-op.

### SMTP encryption key rotation (production)

Use this when you need to replace `SMTP_ENCRYPTION_KEY` with a new key without losing access to already-encrypted passwords. The script decrypts every stored SMTP password with the old key and re-encrypts it with the new key inside a single atomic database transaction. Plaintext passwords (legacy back-fill stragglers) are encrypted with the new key in the same pass.

```bash
# Generate a new key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 1. Dry-run first — prints what would change, writes nothing
DRY_RUN=true \
  OLD_KEY=<current-64-hex-chars> \
  NEW_KEY=<new-64-hex-chars> \
  DATABASE_URL=<prod_connection_string> \
  node artifacts/api-server/scripts/rotate-smtp-key.mjs

# 2. Apply for real
OLD_KEY=<current-64-hex-chars> \
  NEW_KEY=<new-64-hex-chars> \
  DATABASE_URL=<prod_connection_string> \
  node artifacts/api-server/scripts/rotate-smtp-key.mjs

# 3. After the script reports success, update SMTP_ENCRYPTION_KEY in your
#    environment/secrets to the new value and redeploy the API server.
```

- The rotation is **atomic** — all rows are updated in one transaction; a failure rolls everything back.
- **Idempotent** — safe to re-run. If `OLD_KEY` and `NEW_KEY` are the same, rows are simply re-encrypted with no effective change.
- If any row cannot be decrypted with `OLD_KEY` the script aborts before writing anything.
- Script lives at `artifacts/api-server/scripts/rotate-smtp-key.mjs`.

### Schema migrations (production)

SQL migration files live in `artifacts/api-server/src/db/migrations/` numbered `001_...sql`, `002_...sql`, etc. They are idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) and safe to re-run.

- **Deploy**: `pnpm --filter @workspace/api-server run deploy` — builds the server then runs all migrations in order.
- **Migrate only** (manual fallback): `node artifacts/api-server/scripts/migrate.mjs` with `DATABASE_URL` set to the production connection string.
- **Add a new migration**: drop a new numbered `.sql` file in `src/db/migrations/` — the runner picks it up automatically on the next deploy.
- **Do not use `drizzle-kit push` in production** — it prompts interactively and exits 1 in non-TTY environments.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite + Tailwind CSS v3 + React Router v6 (RTL Arabic, Cairo font)
- API: Express (custom, not Express 5) — auth, multi-tenancy, RBAC, rate-limiting, CSRF
- DB: PostgreSQL + Drizzle ORM (schema at `lib/db/src/schema/hesabat.ts`)
- Auth: JWT access tokens (15m) + httpOnly refresh cookie (30d) + double-submit CSRF
- Email: pg-boss background queue + nodemailer (SMTP optional, logs when unconfigured)
- PDF: pdfkit (Arabic font support via Cairo-Regular.ttf)
- Build: esbuild (ESM bundle, heavy deps externalized)

## Where things live

- `artifacts/hesabat/src/` — React frontend (pages, components, hooks, lib)
- `artifacts/hesabat/src/lib/api.ts` — frontend API client (uses `VITE_API_URL`)
- `artifacts/hesabat/src/lib/auth.tsx` — auth context (real API + mock fallback)
- `artifacts/api-server/src/app.ts` — Express app wiring all routes
- `artifacts/api-server/src/modules/` — auth, companies, clients, invoices, payments, products, accounts, subscriptions, plans, platform, public, uploads, invitations, notifications, reports, users
- `artifacts/api-server/src/middleware/` — auth, tenant, RBAC, CSRF, planLimits, error, requestContext
- `artifacts/api-server/src/utils/` — pdf, email, emailQueue, audit, crud, pagination, errors, logger, money, cookies
- `artifacts/api-server/src/config/env.ts` — validated env schema (Zod)
- `artifacts/api-server/src/db/client.ts` — pg Pool connection
- `lib/db/src/schema/hesabat.ts` — Drizzle schema (source of truth for DB)

## Architecture decisions

- Frontend runs on its own Vite dev server (port 18627) and proxies `/api` and `/uploads` to the Express backend (port 8080). In production, a reverse proxy handles this.
- `VITE_API_URL=same-origin` is the sentinel value that enables real-backend mode without setting a hostname — fetch paths are relative so the Vite proxy routes them.
- The backend uses raw `pg` pool (not Drizzle) for query flexibility, especially in multi-tenant handlers where `SET LOCAL app.current_company` scopes the connection.
- Subscriptions and plans gate API access. Every new company gets a free trialing subscription. Seed plans are inserted via `psql` or the admin panel.
- pdfkit and fontkit cannot be bundled by esbuild (they walk the filesystem for fonts). They are externalized in `build.mjs` and installed locally in `artifacts/api-server`.

## Product

- Public landing page, pricing, features, about, contact (Arabic RTL)
- Auth: register (creates company + free trial), login, logout, JWT refresh, password reset, email verification, invitations
- Company dashboard: overview stats, clients, invoices (PDF/email/WhatsApp), payments, accounts, products/inventory
- Reports: aging, monthly sales, overview
- Multi-user: invite team members, RBAC (company_admin, accountant, sales, viewer)
- Admin panel (super_admin): companies, plans, subscriptions, feature access, system notifications, audit log
- File uploads with private/public storage

## User preferences

- Keep Arabic RTL layout and Cairo font styling as the primary design language.
- The app name is "ون كليك" (One Click) — used in the UI — and "Hesabat" as the technical name.

## Gotchas

- Always seed plans before registration or subscriptions will silently fail: `INSERT INTO plans (code, name, ...) VALUES ('free', ...)`
- `pdfkit` must be externalized in `build.mjs` and installed locally (`pnpm add pdfkit` in `artifacts/api-server`) — it cannot be bundled.
- `pg-boss` exports a named class `PgBoss`, not a default export — use `import { PgBoss } from 'pg-boss'`.
- The tenant middleware opens a pg transaction per request; do not call BEGIN/COMMIT manually in route handlers.
- `VITE_API_URL` must be set to `same-origin` (not empty) to enable real-backend API mode in the frontend.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
