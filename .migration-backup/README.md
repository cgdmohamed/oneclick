# Hesabat

A multi-tenant accounting SaaS application consisting of:

- **Frontend**: React 18 + Vite + TypeScript + Tailwind (this folder).
- **Backend**: Node.js + Express + TypeScript + Drizzle ORM + **PostgreSQL** (`backend/` folder).

> No Supabase or managed cloud service is used — everything runs self-hosted on PostgreSQL.

---

## 1) Requirements

- Node.js **20+** and `npm` (or `bun`)
- **PostgreSQL 16+** — either locally or via Docker (recommended)
- (Optional) Docker + Docker Compose

---

## 2) Database setup (PostgreSQL)

### a) Using Docker (fastest)

```bash
cd backend
docker compose up -d postgres
```

Runs PostgreSQL on port `5432` with user/database `hesabat`.

### b) Using local PostgreSQL

Create the database and user manually:

```bash
sudo -u postgres psql -c "CREATE USER hesabat WITH PASSWORD 'hesabat';"
sudo -u postgres psql -c "CREATE DATABASE hesabat OWNER hesabat;"
```

Then update `DATABASE_URL` in `backend/.env`.

---

## 3) Running the Backend

```bash
cd backend
cp .env.example .env          # edit secrets before production
npm install
npm run db:setup              # = db:migrate + db:seed
npm run dev                   # http://localhost:4000
```

### Demo credentials (after `db:seed`)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `owner@hesabat.eg` | `Aa123456!` |
| Company Admin | `admin@alofok.eg` | `Aa123456!` |

### Database commands

```bash
npm run db:generate   # generate a migration file after editing schema.ts
npm run db:migrate    # apply existing migrations (recommended for production)
npm run db:push       # push schema.ts changes directly (fast local dev only)
npm run db:seed       # seed demo data
npm run db:reset      # ⚠️ drop and recreate all tables
npm run db:studio     # Drizzle Studio UI to browse the database
```

> **When to use `db:push` vs `db:migrate`?**
> - `db:push` syncs `schema.ts` with the database immediately without creating a migration file — useful during local development.
> - `db:migrate` applies the SQL files in `src/db/migrations/` — use it in production and CI.

---

## 4) Running the Frontend

```bash
# from project root
cp .env.example .env
# set: VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
```

> If `VITE_API_URL` is left empty, the frontend runs with **in-memory mock data** (mock mode) without needing the backend — useful for previews only.

---

## 5) Running both in parallel

From the project root, run in two terminals:

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
npm run dev
```

Open `http://localhost:5173`.

---

## 6) Production deployment

### Backend (Docker)

```bash
docker build -t hesabat-api ./backend
docker run -d --name hesabat-api -p 4000:4000 \
  -e DATABASE_URL="postgres://user:pass@db-host:5432/hesabat" \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e JWT_REFRESH_SECRET="$(openssl rand -hex 32)" \
  -e CORS_ORIGIN="https://app.example.com" \
  -e APP_URL="https://app.example.com" \
  -e NODE_ENV=production \
  hesabat-api
```

Before first run: `DATABASE_URL=... npm run db:migrate` (inside the container or locally with the same URL).

### Frontend

```bash
npm run build                 # output in dist/
```

Upload `dist/` to any static CDN (Nginx, Cloudflare Pages, Netlify…). Make sure `VITE_API_URL` is set at build time.

---

## 7) Project structure

```
.
├── src/                      # Frontend (React)
│   ├── lib/api.ts            # unified HTTP client for the backend
│   ├── hooks/useResource.ts  # generic CRUD (supports API + mock)
│   ├── pages/, components/, layouts/
│   └── ...
├── backend/                  # Backend (Node + Postgres)
│   ├── src/db/schema.ts      # table definitions (Drizzle)
│   ├── src/db/migrations/    # SQL files
│   ├── src/modules/          # auth, invoices, clients, …
│   ├── docker-compose.yml    # local PostgreSQL
│   └── README.md             # backend details
├── .env.example              # frontend environment variables
└── README.md
```

---

## 8) Important notes

- **Multi-tenant**: data isolation via `company_id` + PostgreSQL Row-Level Security (RLS).
- **Roles**: stored in a separate `user_roles` table (to prevent privilege escalation).
- **Secrets**: change `JWT_SECRET` and `JWT_REFRESH_SECRET` before any deployment (≥ 32 chars).
- **Email**: SMTP is optional — if left empty, emails are printed to stdout.
- **Storage**: uploaded files are saved in `backend/uploads/` and served from `/uploads/*`.

Deeper backend details in [`backend/README.md`](./backend/README.md).
