# Hesabat Backend — Node.js + TypeScript + PostgreSQL

API server for the "Hesabat" application — a multi-tenant accounting SaaS.

## Requirements

- Node.js 20+
- Docker and Docker Compose (to run PostgreSQL locally)
- (Optional) PostgreSQL 16 installed locally without Docker

## Quick start

```bash
cd backend
cp .env.example .env

# 1) Start the database
docker compose up -d postgres

# 2) Install dependencies
npm install

# 3) Create the tables
npm run db:migrate

# 4) Seed demo data (company + user + plans)
npm run db:seed

# 5) Run the API
npm run dev
# http://localhost:4000
```

## Demo credentials

After `npm run db:seed`:

- **Company Admin**: `admin@alofok.eg` / `Aa123456!`
- **Super Admin**: `owner@hesabat.eg` / `Aa123456!`

## Project structure

```
src/
├── index.ts              entry point
├── app.ts                Express setup
├── config/env.ts         environment variables loader
├── db/
│   ├── client.ts         Postgres connection + drizzle
│   ├── schema.ts         table definitions (Drizzle)
│   ├── migrate.ts        runs migrations
│   ├── seed.ts           demo data
│   └── migrations/       SQL files
├── middleware/
│   ├── auth.ts           JWT verification
│   ├── tenant.ts         company data isolation (RLS)
│   ├── rbac.ts           permission checks
│   └── error.ts          error handler
└── modules/
    ├── auth/             register/login/refresh token
    ├── companies/
    ├── users/
    ├── clients/
    ├── invoices/
    ├── payments/
    ├── accounts/
    ├── products/
    ├── reports/
    ├── notifications/
    ├── plans/
    └── subscriptions/
```

## Multi-tenant model

- **Shared Database / Shared Schema** model.
- Every business record carries a `company_id`.
- **PostgreSQL RLS** is enabled on all tables; the policy uses `current_setting('app.current_company')`, which is set by the `tenant.ts` middleware at the start of every request.
- The `user_roles` table is separate from `users` to prevent privilege escalation.

## Wiring it to the frontend

In the frontend (the `hesabat` React project), add:

```bash
# .env
VITE_API_URL=http://localhost:4000
```

Then use `src/lib/api.ts` (already wired up in the frontend).

## Useful commands

```bash
npm run db:generate   # generate a new migration file after editing schema.ts
npm run db:migrate    # apply migrations to the database (production/CI)
npm run db:push       # push schema.ts directly to the database (fast local dev)
npm run db:studio     # Drizzle Studio UI to browse data
npm run db:seed       # re-seed demo data
npm run db:reset      # ⚠️ drop and recreate all tables (destructive!)
npm run db:setup      # shortcut: db:migrate + db:seed
npm run dev           # run in development mode (auto-reload)
npm run build && npm start
npm test              # run vitest tests
```

> **`db:push` vs `db:migrate`**: use `db:push` for instant sync during development,
> and `db:migrate` (with `db:generate`) to manage changes in production via SQL files.

## Production deployment (PM2)

[PM2](https://pm2.keymetrics.io/) is a process manager that keeps the API running, restarts it on crashes, and starts it on server boot.

```bash
# 1) Install PM2 globally (once per server)
npm install -g pm2

# 2) Build the app
cd backend
npm install
npm run build

# 3) Apply DB migrations (first deploy + after each schema change)
npm run db:migrate

# 4) Start the API under PM2
pm2 start dist/index.js --name hesabat-api \
  --time \
  --max-memory-restart 500M \
  --env production

# 5) Persist the process list and enable auto-start on reboot
pm2 save
pm2 startup           # follow the printed command (one-time setup)
```

Make sure `backend/.env` is populated (or that the variables are exported in the shell that launches PM2) — at minimum `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `APP_URL`, and SMTP credentials.

### Useful PM2 commands

```bash
pm2 status                  # list processes
pm2 logs hesabat-api        # tail logs (stdout + stderr)
pm2 logs hesabat-api --lines 200
pm2 restart hesabat-api     # restart after a deploy
pm2 reload hesabat-api      # zero-downtime reload
pm2 stop hesabat-api
pm2 delete hesabat-api
pm2 monit                   # live CPU/memory dashboard
```

### Zero-downtime deploy

```bash
cd backend
git pull
npm install --omit=dev=false
npm run build
npm run db:migrate
pm2 reload hesabat-api --update-env
```

### Running multiple replicas (cluster mode)

```bash
pm2 start dist/index.js --name hesabat-api -i max --env production
```

When running more than one instance, set `RUN_JOBS=false` on every replica except one (see [Environment variables](#environment-variables)) so scheduled jobs only fire once. Also note the in-memory rate-limit / login-lockout ceilings listed under "Known scale ceilings".

### Optional: `ecosystem.config.cjs`

Instead of passing flags on the CLI, you can commit a config file:

```js
// backend/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'hesabat-api',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,                 // or 'max' for cluster mode
      exec_mode: 'fork',            // or 'cluster'
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        RUN_JOBS: 'true',
      },
    },
  ],
};
```

Then: `pm2 start ecosystem.config.cjs`.

## Production deployment (Docker)

```bash
docker build -t hesabat-api ./backend
docker run -d --name hesabat-api \
  -e DATABASE_URL="postgres://user:pass@db-host:5432/hesabat" \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  -e CORS_ORIGIN="https://app.hesabat.example.com" \
  -e APP_URL="https://app.hesabat.example.com" \
  -e SMTP_HOST=smtp.example.com -e SMTP_USER=... -e SMTP_PASS=... \
  -e NODE_ENV=production \
  -e RUN_JOBS=true \
  -e PG_POOL_MAX=10 \
  -v hesabat_uploads:/app/uploads \
  -p 4000:4000 \
  hesabat-api
```

Before the first production run: `DATABASE_URL=... npm run db:migrate`.

Notes:

- The Dockerfile is multi-stage and runs as a non-root user with a `HEALTHCHECK` on `/health`.
- Put a reverse proxy (Nginx/Traefik) in front of the API to provide TLS.
- Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` periodically (≥ 32 chars).
- The full API spec is in `openapi.yaml` (import it into Swagger UI / Postman).

### Environment variables

In addition to the obvious ones:

| Var | Default | Purpose |
|---|---|---|
| `RUN_JOBS` | `true` | SCL-06 — set to `false` on all replicas except one so scheduled jobs (overdue invoices, email queue tick) only run once. |
| `PG_POOL_MAX` | `10` | SCL-07 — per-process pg pool size. Lower (≈5) when fronted by PgBouncer with many app replicas. |
| `PG_IDLE_TIMEOUT_MS` | `30000` | Idle connection timeout. |
| `PG_CONNECT_TIMEOUT_MS` | `10000` | New connection timeout. |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` / `COOKIE_DOMAIN` | — | Refresh-cookie tuning for cross-domain setups (SEC-01/02). |

### Health / readiness endpoints

- `GET /health` — liveness only (process is up). Use for orchestrator restart loops.
- `GET /readyz` — readiness, pings the DB. Use for load-balancer routing. Returns `503` when Postgres is unreachable.

### List endpoints — pagination & search (SCL-05)

All list endpoints accept `?page=` (1-indexed) and `?page_size=` (default 25, max 200) and respond with:

```json
{ "data": [...], "page": 1, "page_size": 25, "total": 137 }
```

`/api/invoices` also supports `?q=` (number or client name) and `?status=`.
Generic CRUD endpoints (clients, products, accounts, …) support `?q=` against whitelisted columns.

### Auth flow extras

- `POST /api/auth/verify-email` `{ token }` — confirm verification token from the welcome email (SEC-08).
- `POST /api/auth/resend-verification` — re-issue the verification email (requires auth).
- Login is locked for 15 minutes after 5 failed attempts per email (SEC-07, in-memory).

## CI (OPS-06)

`.github/workflows/ci.yml` runs lint + typecheck + tests for both frontend and backend on every PR and push to `main`. A real Postgres 16 service container is spun up so the backend tests can hit a database.

## Production operations

### Backups (OPS-08)

The API is stateless apart from `/app/uploads` (mounted volume, see Dockerfile)
and the Postgres database. Recommended minimum for production:

- **Database**: enable point-in-time-recovery on the managed Postgres
  (RDS, Neon, Supabase, Crunchy, etc.). If self-hosting, schedule
  `pg_basebackup` daily + WAL archiving to S3, and rehearse a restore at
  least once before going live.
- **Uploads volume**: snapshot the `/app/uploads` volume nightly (EBS
  snapshot, GCP disk snapshot, or `restic` to S3). Once you move uploads
  to object storage (SCL-02) the volume snapshot becomes unnecessary.
- **Secrets**: store `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`,
  and SMTP credentials in your platform's secret manager — never commit
  `.env` files.

### Known scale ceilings (track before > 1 instance)

- `express-rate-limit` and the SEC-07 login-lockout map are in-memory — pin to a single replica until you move them to Redis (SCL-01).
- Uploads are on local disk — fine for single-instance, breaks behind a load balancer until SCL-02 is done.
- PDFs render inside the API process — for heavy invoice traffic, move to a worker via the existing pg-boss queue (SCL-04).
- The public `/api/plans` response is cached in-process for 60 s (SCL-08); each replica has its own cache and invalidates locally on admin writes — acceptable until you have a shared cache.
