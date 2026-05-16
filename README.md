# Hesabat — حسابات

تطبيق SaaS محاسبي متعدد المستأجرين (Multi-tenant) مكوّن من:

- **Frontend**: React 18 + Vite + TypeScript + Tailwind (هذا المجلد).
- **Backend**: Node.js + Express + TypeScript + Drizzle ORM + **PostgreSQL** (مجلد `backend/`).

> لا يُستخدم Supabase ولا أي خدمة سحابية مُدارة — كل شيء يعمل ذاتياً على PostgreSQL.

---

## 1) المتطلبات

- Node.js **20+** و `npm` (أو `bun`)
- **PostgreSQL 16+** — إمّا محلياً أو عبر Docker (موصى به)
- (اختياري) Docker + Docker Compose

---

## 2) إعداد قاعدة البيانات (PostgreSQL)

### أ) باستخدام Docker (الأسرع)

```bash
cd backend
docker compose up -d postgres
```

يشغّل PostgreSQL على المنفذ `5432` مع المستخدم/قاعدة البيانات `hesabat`.

### ب) باستخدام PostgreSQL محلي

أنشئ القاعدة والمستخدم يدوياً:

```bash
sudo -u postgres psql -c "CREATE USER hesabat WITH PASSWORD 'hesabat';"
sudo -u postgres psql -c "CREATE DATABASE hesabat OWNER hesabat;"
```

ثم حدّث `DATABASE_URL` في `backend/.env`.

---

## 3) تشغيل الـ Backend

```bash
cd backend
cp .env.example .env          # عدّل الأسرار قبل الإنتاج
npm install
npm run db:setup              # = db:migrate + db:seed
npm run dev                   # http://localhost:4000
```

### بيانات الدخول التجريبية (بعد `db:seed`)

| الدور | البريد | كلمة المرور |
|------|------|------|
| Super Admin | `owner@hesabat.sa` | `Aa123456!` |
| Company Admin | `admin@alofok.sa` | `Aa123456!` |

### أوامر قاعدة البيانات

```bash
npm run db:generate   # توليد ملف migration بعد تعديل schema.ts
npm run db:migrate    # تطبيق migrations الموجودة (موصى به للإنتاج)
npm run db:push       # دفع تغييرات schema.ts مباشرة (للتطوير السريع فقط)
npm run db:seed       # زرع البيانات التجريبية
npm run db:reset      # ⚠️ حذف وإعادة إنشاء كل الجداول
npm run db:studio     # واجهة Drizzle Studio لتصفّح القاعدة
```

> **متى تستخدم `db:push` vs `db:migrate`؟**
> - `db:push` يزامن `schema.ts` مع القاعدة فوراً بدون إنشاء ملف migration — مفيد أثناء التطوير المحلي.
> - `db:migrate` يطبّق ملفات SQL في `src/db/migrations/` — استخدمه في الإنتاج والـ CI.

---

## 4) تشغيل الـ Frontend

```bash
# من جذر المشروع
cp .env.example .env
# عدّل: VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
```

> إذا بقي `VITE_API_URL` فارغاً، تعمل الواجهة بـ **بيانات وهمية في الذاكرة** (mock mode) بدون الحاجة للـ backend — مفيد للمعاينة فقط.

---

## 5) التشغيل الكامل بالتوازي

من جذر المشروع، شغّل النافذتين:

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
npm run dev
```

افتح `http://localhost:5173`.

---

## 6) النشر للإنتاج

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

قبل أول تشغيل: `DATABASE_URL=... npm run db:migrate` (داخل الحاوية أو محلياً مع نفس الـ URL).

### Frontend

```bash
npm run build                 # المخرجات في dist/
```

ارفع `dist/` على أي CDN ثابت (Nginx, Cloudflare Pages, Netlify…). تأكد أن `VITE_API_URL` مضبوط وقت البناء.

---

## 7) بنية المشروع

```
.
├── src/                      # Frontend (React)
│   ├── lib/api.ts            # عميل HTTP موحّد للـ backend
│   ├── hooks/useResource.ts  # CRUD generic (يدعم API + mock)
│   ├── pages/, components/, layouts/
│   └── ...
├── backend/                  # Backend (Node + Postgres)
│   ├── src/db/schema.ts      # تعريفات الجداول (Drizzle)
│   ├── src/db/migrations/    # ملفات SQL
│   ├── src/modules/          # auth, invoices, clients, …
│   ├── docker-compose.yml    # PostgreSQL محلي
│   └── README.md             # تفاصيل الـ backend
├── .env.example              # متغيرات الواجهة
└── README.md
```

---

## 8) ملاحظات مهمّة

- **Multi-tenant**: عزل البيانات عبر `company_id` + PostgreSQL Row-Level Security (RLS).
- **الأدوار**: مخزّنة في جدول `user_roles` منفصل (لمنع تصعيد الصلاحيات).
- **الأسرار**: غيّر `JWT_SECRET` و `JWT_REFRESH_SECRET` قبل أي نشر (≥ 32 حرفاً).
- **البريد**: SMTP اختياري — لو ترك فارغاً، تُطبع رسائل البريد على stdout.
- **التخزين**: ملفات الرفع تُحفظ في `backend/uploads/` وتُقدَّم من `/uploads/*`.

تفاصيل أعمق للـ backend في [`backend/README.md`](./backend/README.md).
