# Hesabat / ون كليك

Arabic-first multi-tenant SaaS accounting platform. Companies can issue invoices, track payments, manage clients, products, accounts, and inventory — all in RTL Arabic UI.

## Run & Operate

- Frontend (Vite/React): `artifacts/hesabat` — workflow `artifacts/hesabat: web` (port 18627, proxied to `/`)
- API Server (Express): `artifacts/api-server` — workflow `artifacts/api-server: API Server` (port 8080)
- `pnpm --filter @workspace/db run push` — push Drizzle schema changes to the DB (dev only, not for production)
- Required env: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `VITE_API_URL=same-origin`

### Local commands

Use pnpm from the workspace root.

```bash
# Install dependencies
pnpm install

# Typecheck everything
pnpm run typecheck

# API only
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run migrate
pnpm --filter @workspace/api-server run start

# Frontend only
pnpm --filter @workspace/hesabat run typecheck
pnpm --filter @workspace/hesabat run dev
pnpm --filter @workspace/hesabat run build
```

Notes:

- Frontend dev expects `VITE_API_URL=same-origin` so `/api` and `/uploads` are routed through the Vite proxy to the API.
- Vite currently requires Node `20.19+` or `22.12+`. Node `20.11.1` is too old for frontend builds; use the bundled/runtime Node 24 or install a newer local Node.
- If `pnpm --filter @workspace/hesabat run build` fails with missing `@rollup/rollup-win32-x64-msvc`, refresh optional dependencies with a full pnpm install under a supported Node runtime. The lockfile may skip platform-native optional packages when installed under a different platform/runtime.
- The API build uses esbuild. If pnpm blocks dependency build scripts, run `pnpm approve-builds --all` and retry.

### Test accounts (development seed)

Run once to insert test users and a test company:

```bash
node artifacts/api-server/scripts/seed-test-company.mjs
```

| Role | Email | Password |
|---|---|---|
| super_admin | admin@test.com | Test@12345 |
| company_admin | company@test.com | Test@12345 |

- `admin@test.com` → logs in and is redirected to `/admin`
- `company@test.com` → logs in and is redirected to `/app` (company: شركة الاختبار)
- Script is idempotent — safe to run multiple times.

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

### Accounting setup after deploy

Migration `029_accounting_core.sql` adds the full accounting core: chart of accounts, fiscal years/periods, accounting settings, journal entries, purchases/payables, stock ledger, and opening-balance support.

After deploying/migrating:

1. Log in as a company admin.
2. Open **Accounting Settings** and run default initialization.
3. Review **Chart of Accounts** and adjust account names/codes if needed.
4. Map all required default accounts in **Accounting Settings**.
5. Create fiscal years and periods in **Fiscal Years**.
6. Review **Opening Balances** and run the migration only after confirmation.

Operational accounting pages live under `/app/accounting/*` and purchases under `/app/purchases/*`.

Purchase returns are intentionally not exposed in the UI yet. The backend placeholder returns `501` until the complete inventory, payable, and journal reversal workflow is implemented.

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
- `artifacts/api-server/src/modules/accounting/` — accounting setup, chart accounts, fiscal periods, journal entries, reversals, opening-balance migration, posting helpers
- `artifacts/api-server/src/modules/purchases/` — purchase invoices, purchase invoice items, supplier payments, purchase-return placeholder
- `artifacts/api-server/src/middleware/` — auth, tenant, RBAC, CSRF, planLimits, error, requestContext
- `artifacts/api-server/src/utils/` — pdf, email, emailQueue, audit, crud, pagination, errors, logger, money, cookies
- `artifacts/api-server/src/config/env.ts` — validated env schema (Zod)
- `artifacts/api-server/src/db/client.ts` — pg Pool connection
- `lib/db/src/schema/hesabat.ts` — Drizzle schema (source of truth for DB)

## Architecture decisions

- Frontend runs on its own Vite dev server (port 18627) and proxies `/api` and `/uploads` to the Express backend (port 8080). In production, a reverse proxy handles this.
- `VITE_API_URL=same-origin` is the sentinel value that enables real-backend mode without setting a hostname — fetch paths are relative so the Vite proxy routes them.
- The backend uses raw `pg` pool (not Drizzle) for query flexibility, especially in multi-tenant handlers where `SET LOCAL app.current_company` scopes the connection.
- Subscriptions and plans gate API access. New company registrations are placed in **pending** status and require manual admin approval before they can access the app. Once approved, an admin assigns a subscription plan. Seed plans are inserted via `psql` or the admin panel.
- pdfkit and fontkit cannot be bundled by esbuild (they walk the filesystem for fonts). They are externalized in `build.mjs` and installed locally in `artifacts/api-server`.

## Product

- Public landing page, pricing, features, about, contact (Arabic RTL)
- Auth: register (creates company + free trial), login, logout, JWT refresh, password reset, email verification, invitations
- Company dashboard: overview stats, clients, invoices (PDF/email/WhatsApp), payments, accounts, products/inventory
- Accounting: chart of accounts, fiscal years/period locks, accounting settings, journal entries, reversals, opening balances
- Purchases/payables: purchase invoices, purchase invoice details, supplier payments
- Reports: aging, monthly sales, overview, general ledger, account statements, trial balance, income statement, balance sheet, customer ledger, supplier ledger, VAT, inventory valuation
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
