import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';

// Exercise the real middleware stack without connecting to a database.
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'security-test-secret-'.repeat(3);
process.env.JWT_REFRESH_SECRET = 'security-refresh-secret-'.repeat(3);
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

test('public API requests are limited before database access', async () => {
  const { pool } = await import('../src/db/client.js');
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  let databaseCalls = 0;
  pool.query = (async () => {
    databaseCalls++;
    return { rows: [], rowCount: 0 };
  }) as typeof pool.query;
  pool.connect = (async () => {
    databaseCalls++;
    return { release() {}, query: pool.query };
  }) as typeof pool.connect;

  const { default: app } = await import('../src/app.js');
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const cases = [
      { path: '/api/readyz', status: 200 },
      { path: '/api/public/invoices/test', status: 404 },
      { path: '/api/platform/settings/branding', status: 200 },
      { path: '/api/plans', status: 200 },
      { path: '/api/public/invitations/test', status: 404 },
      { path: '/api/public/invitations/test/accept', status: 404, method: 'POST' },
    ];
    for (const [index, item] of cases.entries()) {
      const headers = {
        'x-forwarded-for': `192.0.2.${index + 1}`,
        'content-type': 'application/json',
      };
      let callsAtLimit = 0;
      for (let i = 0; i < 305; i++) {
        const response = await fetch(base + item.path, {
          method: item.method ?? 'GET', headers,
          ...(item.method ? { body: JSON.stringify({ full_name: 'Test User' }) } : {}),
        });
        assert.equal(response.status, i < 300 ? item.status : 429, `${item.path}, request ${i + 1}`);
        await response.text();
        if (i === 299) callsAtLimit = databaseCalls;
        if (i >= 300) assert.equal(databaseCalls, callsAtLimit, 'blocked requests must not reach the database');
      }
    }

    for (const path of ['/api/auth/refresh', '/api/auth/logout']) {
      const response = await fetch(base + path, {
        method: 'POST',
        headers: { 'x-forwarded-for': '192.0.2.100', cookie: 'hesabat_rt=forged; hesabat_csrf=known' },
      });
      assert.equal(response.status, 403, `${path} requires a CSRF header`);
      await response.text();
    }
    const cookieOnly = await fetch(base + '/api/clients', {
      headers: { 'x-forwarded-for': '192.0.2.101', cookie: 'hesabat_rt=forged' },
    });
    assert.equal(cookieOnly.status, 401);
    await cookieOnly.text();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await pool.end();
  }
});

test('base URL trimming preserves behavior and handles long hostile input', async () => {
  const { setBaseUrl, customFetch } = await import('../../../lib/api-client-react/src/custom-fetch.js');
  const originalFetch = globalThis.fetch;
  let resolved = '';
  globalThis.fetch = (async input => {
    resolved = String(input);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    for (const [base, expected] of [
      [null, '/probe'], ['', '/probe'], ['///', '/probe'],
      ['https://example.com///', 'https://example.com/probe'],
      ['https://example.com/path', 'https://example.com/path/probe'],
      ['https://example.com/' + '/'.repeat(100_000) + 'x', 'https://example.com/' + '/'.repeat(100_000) + 'x/probe'],
      ['https://example.com' + '/'.repeat(100_000), 'https://example.com/probe'],
    ]) {
      setBaseUrl(base);
      await customFetch('/probe');
      assert.equal(resolved, expected);
    }
  } finally {
    setBaseUrl(null);
    globalThis.fetch = originalFetch;
  }
});
