import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { requireAuth } from './middleware/auth.js';
import { tenantContext } from './middleware/tenant.js';

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
import plansRoutes from './modules/plans/routes.js';
import subscriptionsRoutes from './modules/subscriptions/routes.js';
import publicRoutes from './modules/public/routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

  app.get('/', (_req, res) => res.json({ name: 'hesabat-api', status: 'ok' }));
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Public
  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/plans', plansRoutes);

  // Protected
  app.use('/api', requireAuth, tenantContext);
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

  app.use(errorHandler);
  return app;
}
