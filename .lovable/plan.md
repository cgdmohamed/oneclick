
# خطة تجهيز الـ Backend (Node.js + PostgreSQL محلي)

ملاحظة مهمة: الـ Sandbox الحالي يُشغّل واجهة React فقط ولا يستضيف Node خادم دائم. لذلك سيتم إنشاء مشروع backend كامل داخل مجلد `backend/` في نفس الـ repo، يعمل **محلياً عند المستخدم** عبر `npm run dev` ويتصل بـ PostgreSQL محلي. الواجهة الحالية تتحول من Mock إلى استدعاء الـ API.

---

## المرحلة 1 — هيكل المشروع والبنية الأساسية

إنشاء مجلد `backend/` مستقل:

```text
backend/
├── package.json          (express, pg, drizzle-orm, zod, jsonwebtoken, bcrypt, dotenv, cors, helmet)
├── tsconfig.json
├── .env.example          (DATABASE_URL, JWT_SECRET, PORT, CORS_ORIGIN)
├── docker-compose.yml    (postgres:16 + pgadmin اختياري)
├── drizzle.config.ts
├── README.md             (تعليمات التشغيل بالعربية)
└── src/
    ├── index.ts          (نقطة الدخول)
    ├── app.ts            (express app + middlewares)
    ├── config/env.ts     (تحميل وتحقق متغيرات البيئة بـ zod)
    ├── db/
    │   ├── client.ts     (pool + drizzle instance)
    │   ├── schema.ts     (تعريفات الجداول)
    │   └── migrations/   (ملفات SQL مولدة بـ drizzle-kit)
    ├── middleware/
    │   ├── auth.ts       (verify JWT → req.user)
    │   ├── tenant.ts     (استخراج company_id وضبط RLS)
    │   ├── rbac.ts       (فحص الدور)
    │   └── error.ts      (معالج الأخطاء الموحد)
    ├── modules/
    │   ├── auth/         (register, login, refresh, reset-password)
    │   ├── companies/
    │   ├── users/
    │   ├── clients/
    │   ├── invoices/
    │   ├── payments/
    │   ├── accounts/
    │   ├── products/
    │   ├── reports/
    │   ├── notifications/
    │   ├── plans/
    │   └── subscriptions/
    └── utils/
        ├── invoiceNumber.ts
        ├── publicId.ts
        └── pdf.ts
```

كل module يحتوي: `routes.ts`, `controller.ts`, `service.ts`, `schema.ts` (Zod).

---

## المرحلة 2 — مخطط قاعدة البيانات Multi-tenant

عزل البيانات بمبدأ **Shared Database / Shared Schema** + عمود `company_id` في كل جدول + **RLS** على مستوى Postgres.

الجداول الأساسية:

| الجدول | الغرض |
|---|---|
| `companies` | الشركات المشتركة (السجل التجاري، الرقم الضريبي، الشعار) |
| `users` | المستخدمون (email, password_hash, name) |
| `user_companies` | ربط User ↔ Company (لدعم انتماء مستخدم لأكثر من شركة) |
| `user_roles` | دور المستخدم داخل كل شركة (`super_admin`, `company_admin`, `accountant`, `sales`, `viewer`) — جدول منفصل لمنع تصعيد الصلاحيات |
| `plans` | الباقات (سعر، حدود، مدة) |
| `subscriptions` | اشتراكات الشركات بالباقات |
| `feature_access` | تفعيل/تعطيل الميزات لكل باقة |
| `clients` | عملاء الشركة |
| `products` | المنتجات والمخزون |
| `accounts` | الحسابات المالية (نقد/بنك/محفظة) |
| `invoices` | الفواتير (`prefix`, `year`, `sequence`, `public_id`, `status`) |
| `invoice_items` | بنود الفواتير |
| `payments` | المدفوعات (مرتبطة بفاتورة + حساب) |
| `notifications` | تنبيهات لكل شركة/مستخدم |
| `system_notifications` | تنبيهات على مستوى النظام (للمشرف العام) |
| `audit_log` | سجل العمليات الحساسة |

كل جدول (عدا `users`, `plans`, `system_notifications`) يحتوي:
- `id uuid pk default gen_random_uuid()`
- `company_id uuid not null references companies(id) on delete cascade`
- `created_at`, `updated_at`

تفعيل RLS:

```sql
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clients
  USING (company_id = current_setting('app.current_company', true)::uuid);
```

الـ middleware `tenant.ts` ينفذ في بداية كل طلب:
```sql
SET LOCAL app.current_company = '<company-id>';
SET LOCAL app.current_user = '<user-id>';
```

دالة `has_role(_user_id, _company_id, _role)` بـ `SECURITY DEFINER` لتفادي التكرار في سياسات RLS.

---

## المرحلة 3 — المصادقة والصلاحيات

- `POST /auth/register` — تسجيل شركة جديدة + أول مستخدم (admin) في معاملة واحدة.
- `POST /auth/login` — يُرجع `access_token` (15 دقيقة) + `refresh_token` (30 يوم، httpOnly cookie).
- `POST /auth/refresh` — تجديد التوكن.
- `POST /auth/logout` — إلغاء refresh token.
- `POST /auth/forgot-password` + `POST /auth/reset-password` — برمز OTP عبر البريد.
- كلمة المرور بـ `bcrypt` (cost 12).
- JWT يحمل `user_id` فقط؛ الدور و `company_id` يُحملان من DB في كل طلب لمنع الانتحال.

---

## المرحلة 4 — منطق الأعمال (Business Logic)

تحويل كل ما هو حالياً Mock إلى منطق حقيقي:

1. **توليد رقم الفاتورة** — atomic عبر `SELECT … FOR UPDATE` على عدّاد الشركة.
2. **حالة الفاتورة** تُحسب من مجموع المدفوعات: `paid >= total → paid`، `0 < paid < total → partial`، `due_date < now → overdue`.
3. **إنقاص المخزون** عند إنشاء فاتورة بيع داخل معاملة DB.
4. **رصيد الحساب المالي** يُحدّث تلقائياً عند تسجيل دفعة.
5. **رابط الفاتورة العام** `public_id` UUID، endpoint عام `GET /public/invoices/:publicId` بدون مصادقة.
6. **التقارير** SQL aggregations حقيقية (مبيعات، عملاء، أعمار ديون).

---

## المرحلة 5 — تشغيل محلي

`docker-compose.yml` يُقدّم Postgres 16 جاهز. الأوامر:

```bash
cd backend
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed       # بيانات تجريبية (شركة + مستخدم + باقات)
npm run dev           # http://localhost:4000
```

---

## المرحلة 6 — ربط الـ Frontend

- إضافة `src/lib/api.ts` (Axios instance مع interceptor للتوكن والـ refresh).
- إضافة `VITE_API_URL` في `.env`.
- استبدال `src/data/mock.ts` تدريجياً بـ React Query hooks تنادي الـ API.
- تحديث `src/lib/auth.ts` ليستخدم `/auth/login` الفعلي بدل localStorage فقط.
- إبقاء بنية الواجهة كما هي (لا تغيير بصري).

---

## ما سيتم تنفيذه في هذه الخطوة

عند الموافقة، سأبني **المراحل 1 و 2 و 3 و 5 كاملة** + **المرحلة 4 للوحدات الأساسية** (auth, companies, clients, invoices, invoice_items, payments) + **بداية المرحلة 6** (API client + ربط شاشة Login + شاشة Clients كنموذج). باقي الوحدات تُربط بنفس النمط في طلبات لاحقة لتفادي تضخم التغييرات.

## ما لن يُنفّذ الآن

- إرسال البريد الفعلي (سيُترك hook