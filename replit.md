# Hesabat / ون كليك

Arabic-first multi-tenant SaaS accounting platform. Companies can issue invoices, track payments, manage clients, products, accounts, and inventory — all in RTL Arabic UI.

## Run & Operate

- Frontend (Vite/React): `artifacts/hesabat` — workflow `artifacts/hesabat: web` (port 18627, proxied to `/`)
- API Server (Express): `artifacts/api-server` — workflow `artifacts/api-server: API Server` (port 8080)
- `pnpm --filter @workspace/db run push` — push Drizzle schema changes to the DB (dev only)
- Required env: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `VITE_API_URL=same-origin`

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
