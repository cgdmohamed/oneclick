# Hesabat Backend — Node.js + TypeScript + PostgreSQL

خادم API لتطبيق "حسابات" — Multi-tenant SaaS محاسبي.

## المتطلبات

- Node.js 20+
- Docker و Docker Compose (لتشغيل PostgreSQL محلياً)
- (اختياري) PostgreSQL 16 مثبّت محلياً بدون Docker

## التشغيل السريع

```bash
cd backend
cp .env.example .env

# 1) شغّل قاعدة البيانات
docker compose up -d postgres

# 2) ثبّت الحزم
npm install

# 3) أنشئ الجداول
npm run db:migrate

# 4) أدخل بيانات تجريبية (شركة + مستخدم + باقات)
npm run db:seed

# 5) شغّل الـ API
npm run dev
# http://localhost:4000
```

## بيانات الدخول التجريبية

بعد `npm run db:seed`:

- **مدير شركة**: `admin@alofok.sa` / `Aa123456!`
- **مشرف عام (Super Admin)**: `owner@hesabat.sa` / `Aa123456!`

## بنية المشروع

```
src/
├── index.ts              نقطة الدخول
├── app.ts                إعداد Express
├── config/env.ts         تحميل المتغيرات
├── db/
│   ├── client.ts         اتصال Postgres + drizzle
│   ├── schema.ts         تعريفات الجداول (Drizzle)
│   ├── migrate.ts        تنفيذ migrations
│   ├── seed.ts           بيانات تجريبية
│   └── migrations/       ملفات SQL
├── middleware/
│   ├── auth.ts           فحص JWT
│   ├── tenant.ts         عزل بيانات الشركة (RLS)
│   ├── rbac.ts           فحص الصلاحيات
│   └── error.ts          معالج الأخطاء
└── modules/
    ├── auth/             تسجيل/دخول/تجديد توكن
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

## مبدأ Multi-Tenant

- نموذج **Shared Database / Shared Schema**.
- كل سجل تجاري يحمل `company_id`.
- **PostgreSQL RLS** مفعّل على كل الجداول؛ السياسة تستخدم `current_setting('app.current_company')` التي يضبطها middleware `tenant.ts` في بداية كل طلب.
- جدول `user_roles` منفصل عن `users` لمنع تصعيد الصلاحيات.

## ربطه بالواجهة

في الواجهة (`hesabat` الـ React project)، أضف:

```bash
# .env
VITE_API_URL=http://localhost:4000
```

ثم استخدم `src/lib/api.ts` (تم تجهيزه في الواجهة).

## أوامر مفيدة

```bash
npm run db:generate   # توليد ملف migration جديد بعد تعديل schema.ts
npm run db:migrate    # تطبيق migrations على القاعدة
npm run db:seed       # إعادة زرع البيانات التجريبية
npm run db:reset      # حذف وإعادة إنشاء كل الجداول (تدميري!)
npm run dev           # تشغيل بوضع التطوير (auto-reload)
npm run build && npm start
```

## نقاط التوسعة

- **البريد**: `src/modules/auth/email.ts` يحتوي stub — استبدله بـ Resend/Sendgrid/SMTP.
- **المدفوعات**: `src/modules/subscriptions/billing.ts` stub لـ Stripe/Paddle.
- **التخزين**: ارفع الشعارات/الأختام إلى S3/MinIO (حالياً Base64 في DB).
