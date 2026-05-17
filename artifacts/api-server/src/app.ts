import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { requireAuth } from './middleware/auth.js';
import { tenantContext } from './middleware/tenant.js';
import { requireActiveSubscription } from './middleware/planLimits.js';
import { requestContext } from './middleware/requestContext.js';

import authRoutes from './modules/auth/routes.js';
import auditRoutes from './modules/audit/routes.js';
import companiesRoutes from './modules/companies/routes.js';
import usersRoutes from './modules/users/routes.js';
import clientsRoutes from './modules/clients/routes.js';
import productsRoutes from './modules/products/routes.js';
import accountsRoutes from './modules/accounts/routes.js';
import invoicesRoutes from './modules/invoices/routes.js';
import paymentsRoutes from './modules/payments/routes.js';
import notificationsRoutes from './modules/notifications/routes.js';
import reportsRoutes from './modules/reports/routes.js';
import { publicPlansRouter, adminPlansRouter } from './modules/plans/routes.js';
import subscriptionsRoutes from './modules/subscriptions/routes.js';
import publicRoutes from './modules/public/routes.js';
import uploadsRoutes from './modules/uploads/routes.js';
import platformRoutes from './modules/platform/routes.js';
import { publicSettingsRouter } from './modules/platform/settingsRoutes.js';
import { invitationsAdminRouter, invitationsPublicRouter } from './modules/invitations/routes.js';

const UPLOAD_PUBLIC = path.resolve(process.cwd(), 'uploads/public');
fs.mkdirSync(UPLOAD_PUBLIC, { recursive: true });

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many auth attempts, try again later.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const app = express();

app.set('trust proxy', 1);
app.use(requestContext);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Never reflect all origins with credentials — that creates a wide CSRF surface.
// "same-origin" sentinel means the frontend is proxied, so no explicit CORS needed.
const origins: string[] | boolean =
  !env.CORS_ORIGIN || env.CORS_ORIGIN === 'same-origin'
    ? false  // same-origin: CORS not needed (Vite proxy / reverse-proxy handles routing)
    : env.CORS_ORIGIN.split(',').map((s) => s.trim());

app.use(cors({
  origin: origins,
  credentials: true,
  exposedHeaders: ['x-request-id'],
}));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/api/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/readyz', async (_req, res) => {
  try {
    const { pool } = await import('./db/client.js');
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'down', error: (e as Error).message });
  }
});

app.use('/uploads/public', express.static(UPLOAD_PUBLIC, { maxAge: '7d', immutable: false }));

// Public routes
app.use('/api/public', publicRoutes);
app.use('/api/public/invitations', invitationsPublicRouter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/plans', publicPlansRouter);
app.use('/api/platform/settings', publicSettingsRouter);

// Protected API
app.use('/api', apiLimiter, requireAuth, tenantContext, requireActiveSubscription);
app.use('/api/plans', adminPlansRouter);
app.use('/api/companies', companiesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/audit-log', auditRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/invitations', invitationsAdminRouter);

// Production: serve the built React frontend so a single process handles everything.
// The frontend build output sits two levels up from this file's compiled location
// (artifacts/api-server/dist/ → artifacts/hesabat/dist/public/).
// Dev is unaffected — the Vite dev server handles the frontend in that case.
if (env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const FRONTEND_DIST = path.resolve(__dirname, '../../hesabat/dist/public');
  app.use(express.static(FRONTEND_DIST, { maxAge: '1d', index: 'index.html' }));
  // Catch-all for React Router: only handle paths that are NOT under /api or /uploads
  // so unmatched API/upload requests still fall through to the error handler as 404 JSON.
  app.get(/^(?!\/(api|uploads))(\/.*)?$/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.use(errorHandler);

export default app;
