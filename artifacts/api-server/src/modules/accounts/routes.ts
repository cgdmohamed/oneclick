import { Router } from 'express';
import { z } from 'zod';
import { parsePagination } from '../../utils/pagination.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { ensureAccountingSetup } from '../accounting/posting.js';

const r = Router();

const schema = z.object({
  name: z.string().min(1),
  type: z.enum(['cash','bank','wallet']).default('cash'),
  bank_name: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  balance: z.coerce.number().default(0),
  is_active: z.boolean().default(true),
  // Optional link to a dedicated chart-of-accounts ledger entry (e.g. a
  // bank's own sub-code like 1021) so this account's payments post there
  // instead of the single shared bank/cash/wallet fallback account from
  // accounting_settings — see moneyAccountChartAccount() in posting.ts,
  // which already prefers this column when set. Previously unreachable
  // from the API/UI, so every account silently used the shared fallback.
  chart_account_id: z.string().uuid().optional().nullable(),
});

async function assertChartAccount(db: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> }, companyId: string, chartAccountId?: string | null) {
  if (!chartAccountId) return;
  const rs = await db.query(`SELECT 1 FROM chart_accounts WHERE id = $1 AND company_id = $2`, [chartAccountId, companyId]);
  if (!rs.rowCount) throw badRequest('Invalid chart of accounts entry');
}

const FIELDS = ['name', 'type', 'bank_name', 'iban', 'balance', 'is_active', 'chart_account_id'] as const;

r.get('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    // Lazily seeds the chart of accounts/accounting settings AND (see
    // ensureAccountingSetup) a default cash "financial account" row the
    // first time a company touches accounting — same lazy-init pattern as
    // GET /accounting/chart-accounts. Without this, a brand-new company had
    // no account to pick from on its very first payment collection.
    await ensureAccountingSetup(t.db, t.companyId);
    const p = parsePagination(req);
    const q = (req.query.q as string | undefined)?.trim();
    const params: unknown[] = [t.companyId];
    let where = `WHERE a.company_id = $1`;
    if (q) {
      params.push(`%${q}%`);
      where += ` AND a.name ILIKE $${params.length}`;
    }
    const totalQ = await t.db.query(`SELECT count(*)::int AS count FROM accounts a ${where}`, params);
    const applied = p.applyTo(
      `SELECT a.*, ca.code AS chart_account_code, ca.name AS chart_account_name
       FROM accounts a LEFT JOIN chart_accounts ca ON ca.id = a.chart_account_id
       ${where} ORDER BY a.created_at DESC`,
      params,
    );
    const rs = await t.db.query(applied.sql, applied.params);
    res.json(p.respond(rs.rows, Number(totalQ.rows[0]?.count ?? 0)));
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT a.*, ca.code AS chart_account_code, ca.name AS chart_account_name
       FROM accounts a LEFT JOIN chart_accounts ca ON ca.id = a.chart_account_id
       WHERE a.id = $1 AND a.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!rs.rowCount) throw notFound();
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.post('/', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = schema.parse(req.body);
    await assertChartAccount(t.db, t.companyId, body.chart_account_id);
    const values = FIELDS.map((f) => (body as Record<string, unknown>)[f] ?? null);
    const rs = await t.db.query(
      `INSERT INTO accounts (company_id, ${FIELDS.join(',')}) VALUES ($1, ${FIELDS.map((_, i) => `$${i + 2}`).join(',')}) RETURNING *`,
      [t.companyId, ...values],
    );
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.patch('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = schema.partial().parse(req.body);
    if ('chart_account_id' in body) await assertChartAccount(t.db, t.companyId, body.chart_account_id);
    const keys = FIELDS.filter((f) => f in body);
    if (!keys.length) return res.json({ data: null });
    const values = keys.map((f) => (body as Record<string, unknown>)[f]);
    const set = keys.map((f, i) => `${f} = $${i + 3}`).join(', ');
    const rs = await t.db.query(
      `UPDATE accounts SET ${set} WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, t.companyId, ...values],
    );
    if (!rs.rowCount) throw notFound();
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.delete('/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`DELETE FROM accounts WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
    res.json({ ok: true, deleted: rs.rowCount });
  } catch (e) { next(e); }
});

export default r;
