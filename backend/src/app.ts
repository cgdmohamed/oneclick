import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';

import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { requireAuth } from './middleware/auth.js';
import { tenantContext } from './middleware/tenant.js';
import { requireActiveSubscription } from './middleware/planLimits.js';

import authRoutes from './modules/auth/routes.js';
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
import uploadsRoutes, { UPLOAD_PUBLIC } from './modules/uploads/routes.js';
import platformRoutes from './modules/platform/routes.js';
import { invitationsAdminRouter, invitationsPublicRouter } from './modules/invitations/routes.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                  // 30 attempts per IP per window
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

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

  app.get('/', (_req, res) => res.json({ name: 'hesabat-api', status: 'ok' }));
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Static uploads — ONLY public assets (logos/stamps). Private attachments
  // are served by the authenticated /api/uploads/file/:id handler (SEC-04).
  app.use('/uploads/public', express.static(UPLOAD_PUBLIC, { maxAge: '7d', immutable: false }));

  // Public
  app.use('/api/public', publicRoutes);
  app.use('/api/public/invitations', invitationsPublicRouter);
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/plans', publicPlansRouter);

  // Protected API surface
  app.use('/api', apiLimiter, requireAuth, tenantContext, requireActiveSubscription);
  // Admin CRUD on plans must run AFTER auth+tenantContext so requireSuperAdmin works. (BUG-03)
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
  app.use('/api/uploads', uploadsRoutes);
  app.use('/api/invitations', invitationsAdminRouter);
  app.use('/api/platform', platformRoutes);

  app.use(errorHandler);
  return app;
}

// keep `path` import used in case future absolute paths are needed
void path;
