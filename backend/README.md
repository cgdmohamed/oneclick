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

- **Company Admin**: `admin@alofok.sa` / `Aa123456!`
- **Super Admin**: `owner@hesabat.sa` / `Aa123456!`

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
  -p 4000:4000 \
  hesabat-api
```

Before the first production run: `DATABASE_URL=... npm run db:migrate`.

Notes:

- The Dockerfile is multi-stage and runs as a non-root user with a `HEALTHCHECK` on `/health`.
- Put a reverse proxy (Nginx/Traefik) in front of the API to provide TLS.
- Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` periodically (≥ 32 chars).
- The full API spec is in `openapi.yaml` (import it into Swagger UI / Postman).

## Tests

Smoke tests are ready under `src/__tests__/`. For integration tests run
`docker compose up -d postgres` then `npm test`.

## Extension points

- **Email**: `src/utils/email.ts` supports SMTP or falls back to stdout.
- **Payments**: fully manual via `/api/platform/subscription-payments`.
- **Storage**: files are saved under `/uploads` and served via `/uploads/*`.
