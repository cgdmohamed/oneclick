/**
 * Smoke tests — verify the Express app boots and the unauthenticated
 * surface (health, root, missing routes, auth validation) behaves correctly.
 *
 * Run: npm test
 *
 * These tests do NOT require a live Postgres — `createApp()` only touches DB
 * when a route handler runs that needs it. The endpoints exercised here
 * either bypass DB (`/health`) or fail fast on validation/missing JWT.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('app smoke', () => {
  it('GET /health → 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET / → 200 service banner', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('hesabat-api');
  });

  it('GET /api/clients without token → 401', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login with bad payload → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('GET unknown route → 404 from express default', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
  });
});
