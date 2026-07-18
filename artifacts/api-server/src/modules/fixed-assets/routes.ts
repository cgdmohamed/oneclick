import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../utils/audit.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { assertBranch, assertCostCenter } from '../../utils/dimensions.js';
import { assertPeriodOpen, createJournalEntry, getSettings, reverseJournalEntry } from '../accounting/posting.js';

const r = Router();

const categorySchema = z.object({
  name: z.string().min(1),
  fixed_asset_account_id: z.string().uuid().optional().nullable(),
  accumulated_depreciation_account_id: z.string().uuid().optional().nullable(),
  depreciation_expense_account_id: z.string().uuid().optional().nullable(),
  default_useful_life_months: z.coerce.number().int().positive().default(60),
  is_active: z.boolean().default(true),
});

const assetSchema = z.object({
  asset_code: z.string().min(1),
  name: z.string().min(1),
  category_id: z.string().uuid(),
  purchase_date: z.string(),
  acquisition_cost: z.coerce.number().nonnegative(),
  salvage_value: z.coerce.number().nonnegative().default(0),
  useful_life_months: z.coerce.number().int().positive(),
  depreciation_start_date: z.string(),
  status: z.enum(['active', 'fully_depreciated', 'disposed']).default('active'),
  branch_id: z.string().uuid().optional().nullable(),
  cost_center_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

async function assertAccount(db: any, companyId: string, accountId?: string | null) {
  if (!accountId) return;
  const rs = await db.query(`SELECT 1 FROM chart_accounts WHERE id = $1 AND company_id = $2`, [accountId, companyId]);
  if (!rs.rowCount) throw badRequest('Invalid chart account');
}

async function depreciationPreview(db: any, companyId: string, periodId: string) {
  const period = await db.query(`SELECT * FROM accounting_periods WHERE id = $1 AND company_id = $2`, [periodId, companyId]);
  if (!period.rowCount) throw notFound('Accounting period not found');
  const p = period.rows[0];
  const assets = await db.query(
    `SELECT fa.*, ac.name AS category_name,
            COALESCE(ac.depreciation_expense_account_id, s.depreciation_expense_account_id) AS depreciation_expense_account_id,
            COALESCE(ac.accumulated_depreciation_account_id, s.accumulated_depreciation_account_id) AS accumulated_depreciation_account_id,
            COALESCE(dep.accumulated,0) AS accumulated_depreciation
     FROM fixed_assets fa
     JOIN asset_categories ac ON ac.id = fa.category_id
     JOIN accounting_settings s ON s.company_id = fa.company_id
     LEFT JOIN (
       SELECT drl.asset_id, SUM(drl.depreciation_amount) AS accumulated
       FROM depreciation_run_lines drl
       JOIN depreciation_runs dr ON dr.id = drl.depreciation_run_id
       WHERE drl.company_id = $1 AND dr.status = 'posted'
       GROUP BY drl.asset_id
     ) dep ON dep.asset_id = fa.id
     WHERE fa.company_id = $1
       AND fa.status = 'active'
       AND fa.depreciation_start_date <= $2::date
       AND NOT EXISTS (
         SELECT 1 FROM depreciation_run_lines x
         JOIN depreciation_runs r ON r.id = x.depreciation_run_id
         WHERE x.company_id = $1 AND x.asset_id = fa.id AND r.period_id = $3 AND r.status != 'cancelled'
       )
     ORDER BY fa.asset_code`,
    [companyId, p.ends_on, periodId],
  );
  const lines = assets.rows.map((asset: any) => {
    const depreciable = Math.max(0, Number(asset.acquisition_cost) - Number(asset.salvage_value));
    const monthly = round2(depreciable / Number(asset.useful_life_months));
    const remaining = round2(Math.max(0, depreciable - Number(asset.accumulated_depreciation)));
    const amount = round2(Math.min(monthly, remaining));
    return {
      asset_id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.name,
      category_name: asset.category_name,
      depreciation_amount: amount,
      accumulated_depreciation_after: round2(Number(asset.accumulated_depreciation) + amount),
      depreciation_expense_account_id: asset.depreciation_expense_account_id,
      accumulated_depreciation_account_id: asset.accumulated_depreciation_account_id,
      branch_id: asset.branch_id,
      cost_center_id: asset.cost_center_id,
    };
  }).filter((line: any) => line.depreciation_amount > 0);
  return { period: p, lines, total: round2(lines.reduce((sum: number, line: any) => sum + Number(line.depreciation_amount), 0)) };
}

r.get('/categories', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`SELECT * FROM asset_categories WHERE company_id = $1 ORDER BY name`, [t.companyId]);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/categories', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = categorySchema.parse(req.body);
    for (const key of ['fixed_asset_account_id', 'accumulated_depreciation_account_id', 'depreciation_expense_account_id'] as const) await assertAccount(t.db, t.companyId, body[key]);
    const rs = await t.db.query(
      `INSERT INTO asset_categories (company_id, name, fixed_asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, default_useful_life_months, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [t.companyId, body.name, body.fixed_asset_account_id ?? null, body.accumulated_depreciation_account_id ?? null, body.depreciation_expense_account_id ?? null, body.default_useful_life_months, body.is_active],
    );
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'asset_category.create', entity: 'asset_category', entityId: rs.rows[0].id });
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.patch('/categories/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = categorySchema.partial().parse(req.body);
    for (const key of ['fixed_asset_account_id', 'accumulated_depreciation_account_id', 'depreciation_expense_account_id'] as const) await assertAccount(t.db, t.companyId, body[key]);
    const fields = Object.keys(body);
    if (!fields.length) throw badRequest('No changes supplied');
    const sets = fields.map((key, i) => `${key} = $${i + 3}`).join(', ');
    const values = fields.map((key) => (body as any)[key]);
    const rs = await t.db.query(`UPDATE asset_categories SET ${sets}, updated_at = NOW() WHERE id = $1 AND company_id = $2 RETURNING *`, [req.params.id, t.companyId, ...values]);
    if (!rs.rowCount) throw notFound('Asset category not found');
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.get('/assets', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT fa.*, ac.name AS category_name,
              COALESCE(dep.accumulated,0) AS accumulated_depreciation,
              GREATEST(0, fa.acquisition_cost - fa.salvage_value - COALESCE(dep.accumulated,0)) AS net_book_value
       FROM fixed_assets fa
       JOIN asset_categories ac ON ac.id = fa.category_id
       LEFT JOIN (
         SELECT drl.asset_id, SUM(drl.depreciation_amount) AS accumulated
         FROM depreciation_run_lines drl JOIN depreciation_runs dr ON dr.id = drl.depreciation_run_id
         WHERE drl.company_id = $1 AND dr.status = 'posted'
         GROUP BY drl.asset_id
       ) dep ON dep.asset_id = fa.id
       WHERE fa.company_id = $1 ORDER BY fa.asset_code`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.get('/assets/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const asset = await t.db.query(
      `SELECT fa.*, ac.name AS category_name FROM fixed_assets fa JOIN asset_categories ac ON ac.id = fa.category_id WHERE fa.id = $1 AND fa.company_id = $2`,
      [req.params.id, t.companyId],
    );
    if (!asset.rowCount) throw notFound('Fixed asset not found');
    const lines = await t.db.query(
      `SELECT drl.*, dr.run_date, dr.status AS run_status, dr.journal_entry_id, ap.name AS period_name
       FROM depreciation_run_lines drl
       JOIN depreciation_runs dr ON dr.id = drl.depreciation_run_id
       JOIN accounting_periods ap ON ap.id = dr.period_id
       WHERE drl.asset_id = $1 AND drl.company_id = $2
       ORDER BY dr.run_date DESC`,
      [req.params.id, t.companyId],
    );
    res.json({ data: { ...asset.rows[0], depreciation_lines: lines.rows } });
  } catch (e) { next(e); }
});

r.post('/assets', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = assetSchema.parse(req.body);
    const cat = await t.db.query(`SELECT 1 FROM asset_categories WHERE id = $1 AND company_id = $2`, [body.category_id, t.companyId]);
    if (!cat.rowCount) throw badRequest('Invalid asset category');
    await assertBranch(t.db, t.companyId, body.branch_id);
    await assertCostCenter(t.db, t.companyId, body.cost_center_id);
    const rs = await t.db.query(
      `INSERT INTO fixed_assets (company_id, asset_code, name, category_id, purchase_date, acquisition_cost, salvage_value, useful_life_months, depreciation_start_date, status, branch_id, cost_center_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [t.companyId, body.asset_code, body.name, body.category_id, body.purchase_date, body.acquisition_cost, body.salvage_value, body.useful_life_months, body.depreciation_start_date, body.status, body.branch_id ?? null, body.cost_center_id ?? null, body.notes ?? null],
    );
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'fixed_asset.create', entity: 'fixed_asset', entityId: rs.rows[0].id });
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.patch('/assets/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const used = await t.db.query(`SELECT 1 FROM depreciation_run_lines WHERE asset_id = $1 AND company_id = $2 LIMIT 1`, [req.params.id, t.companyId]);
    const body = assetSchema.partial().parse(req.body);
    if (used.rowCount && ('acquisition_cost' in body || 'salvage_value' in body || 'useful_life_months' in body || 'depreciation_start_date' in body)) {
      throw conflict('Depreciated assets can only update descriptive fields or dimensions');
    }
    if (body.branch_id !== undefined) await assertBranch(t.db, t.companyId, body.branch_id);
    if (body.cost_center_id !== undefined) await assertCostCenter(t.db, t.companyId, body.cost_center_id);
    const fields = Object.keys(body);
    if (!fields.length) throw badRequest('No changes supplied');
    const sets = fields.map((key, i) => `${key} = $${i + 3}`).join(', ');
    const values = fields.map((key) => (body as any)[key]);
    const rs = await t.db.query(`UPDATE fixed_assets SET ${sets}, updated_at = NOW() WHERE id = $1 AND company_id = $2 RETURNING *`, [req.params.id, t.companyId, ...values]);
    if (!rs.rowCount) throw notFound('Fixed asset not found');
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.get('/depreciation/preview', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const periodId = z.string().uuid().parse(req.query.period_id);
    const preview = await depreciationPreview(t.db, t.companyId, periodId);
    res.json({ data: preview });
  } catch (e) { next(e); }
});

r.get('/depreciation-runs', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT dr.*, ap.name AS period_name, ap.starts_on, ap.ends_on, COALESCE(SUM(drl.depreciation_amount),0) AS total
       FROM depreciation_runs dr
       JOIN accounting_periods ap ON ap.id = dr.period_id
       LEFT JOIN depreciation_run_lines drl ON drl.depreciation_run_id = dr.id
       WHERE dr.company_id = $1
       GROUP BY dr.id, ap.name, ap.starts_on, ap.ends_on
       ORDER BY dr.run_date DESC`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/depreciation-runs', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const body = z.object({ period_id: z.string().uuid(), post: z.boolean().default(false) }).parse(req.body);
    const preview = await depreciationPreview(t.db, t.companyId, body.period_id);
    await assertPeriodOpen(t.db, t.companyId, preview.period.ends_on);
    if (!preview.lines.length) throw badRequest('No depreciation lines available for this period');
    await t.db.query('BEGIN');
    try {
      const run = await t.db.query(
        `INSERT INTO depreciation_runs (company_id, period_id, run_date, status, created_by)
         VALUES ($1,$2,NOW(),'draft',$3) RETURNING *`,
        [t.companyId, body.period_id, req.auth!.userId],
      );
      for (const line of preview.lines) {
        await t.db.query(
          `INSERT INTO depreciation_run_lines (company_id, depreciation_run_id, asset_id, depreciation_amount, accumulated_depreciation_after)
           VALUES ($1,$2,$3,$4,$5)`,
          [t.companyId, run.rows[0].id, line.asset_id, line.depreciation_amount, line.accumulated_depreciation_after],
        );
      }
      if (body.post) await postRun(t.db, t.companyId, run.rows[0].id, req.auth!.userId);
      await t.db.query('COMMIT');
      res.status(201).json({ data: run.rows[0] });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

async function postRun(db: any, companyId: string, runId: string, userId?: string | null) {
  const run = await db.query(`SELECT dr.*, ap.ends_on FROM depreciation_runs dr JOIN accounting_periods ap ON ap.id = dr.period_id WHERE dr.id = $1 AND dr.company_id = $2 FOR UPDATE`, [runId, companyId]);
  if (!run.rowCount) throw notFound('Depreciation run not found');
  if (run.rows[0].status === 'posted' && run.rows[0].journal_entry_id) return run.rows[0].journal_entry_id;
  if (run.rows[0].status === 'cancelled') throw badRequest('Cancelled run cannot be posted');
  await assertPeriodOpen(db, companyId, run.rows[0].ends_on);
  const lines = await db.query(
    `SELECT drl.*, fa.name AS asset_name, fa.branch_id, fa.cost_center_id,
            COALESCE(ac.depreciation_expense_account_id, s.depreciation_expense_account_id) AS expense_account_id,
            COALESCE(ac.accumulated_depreciation_account_id, s.accumulated_depreciation_account_id) AS accumulated_account_id
     FROM depreciation_run_lines drl
     JOIN fixed_assets fa ON fa.id = drl.asset_id
     JOIN asset_categories ac ON ac.id = fa.category_id
     JOIN accounting_settings s ON s.company_id = fa.company_id
     WHERE drl.depreciation_run_id = $1 AND drl.company_id = $2`,
    [runId, companyId],
  );
  const journalLines = lines.rows.flatMap((line: any) => [
    { accountId: line.expense_account_id, debit: Number(line.depreciation_amount), description: `Depreciation ${line.asset_name}`, branchId: line.branch_id, costCenterId: line.cost_center_id },
    { accountId: line.accumulated_account_id, credit: Number(line.depreciation_amount), description: `Depreciation ${line.asset_name}`, branchId: line.branch_id, costCenterId: line.cost_center_id },
  ]);
  const je = await createJournalEntry(db, {
    companyId,
    entryDate: run.rows[0].ends_on,
    memo: 'Depreciation run',
    source: { type: 'depreciation_run', id: runId },
    userId,
    lines: journalLines,
  });
  await db.query(`UPDATE depreciation_runs SET status = 'posted', posted_at = NOW(), posted_by = $3, journal_entry_id = $4, updated_at = NOW() WHERE id = $1 AND company_id = $2`, [runId, companyId, userId ?? null, je.id]);
  await db.query(
    `UPDATE fixed_assets fa SET status = 'fully_depreciated', updated_at = NOW()
     WHERE fa.company_id = $1 AND fa.status = 'active'
       AND EXISTS (
         SELECT 1 FROM depreciation_run_lines drl
         WHERE drl.asset_id = fa.id AND drl.depreciation_run_id = $2
           AND drl.accumulated_depreciation_after >= fa.acquisition_cost - fa.salvage_value - 0.005
       )`,
    [companyId, runId],
  );
  return je.id;
}

r.post('/depreciation-runs/:id/post', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      const journalEntryId = await postRun(t.db, t.companyId, req.params.id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'depreciation_run.post', entity: 'depreciation_run', entityId: req.params.id });
      await t.db.query('COMMIT');
      res.json({ data: { journal_entry_id: journalEntryId } });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

r.post('/depreciation-runs/:id/cancel', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      const run = await t.db.query(`SELECT * FROM depreciation_runs WHERE id = $1 AND company_id = $2 FOR UPDATE`, [req.params.id, t.companyId]);
      if (!run.rowCount) throw notFound('Depreciation run not found');
      if (run.rows[0].status === 'cancelled') throw badRequest('Run already cancelled');
      if (run.rows[0].journal_entry_id) await reverseJournalEntry(t.db, t.companyId, run.rows[0].journal_entry_id, req.auth!.userId);
      await t.db.query(`UPDATE depreciation_runs SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND company_id = $2`, [req.params.id, t.companyId]);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'depreciation_run.cancel', entity: 'depreciation_run', entityId: req.params.id });
      await t.db.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await t.db.query('ROLLBACK');
      throw e;
    }
  } catch (e) { next(e); }
});

export default r;
