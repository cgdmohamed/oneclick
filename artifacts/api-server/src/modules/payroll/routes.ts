import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../utils/audit.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { assertBranch, assertCostCenter } from '../../utils/dimensions.js';
import { assertPeriodOpen, createJournalEntry, getSettings } from '../accounting/posting.js';

const r = Router();

const employeeSchema = z.object({
  employee_code: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  national_id: z.string().optional().nullable(),
  hire_date: z.string(),
  status: z.enum(['active','inactive']).default('active'),
  branch_id: z.string().uuid().optional().nullable(),
  cost_center_id: z.string().uuid().optional().nullable(),
  basic_salary: z.coerce.number().nonnegative(),
  notes: z.string().optional().nullable(),
});

const componentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['earning','deduction','employer_contribution']),
  account_id: z.string().uuid(),
  is_active: z.boolean().default(true),
});

const lineInputSchema = z.object({
  employee_id: z.string().uuid(),
  components: z.array(z.object({ salary_component_id: z.string().uuid(), amount: z.coerce.number().nonnegative() })).default([]),
});

type PreviewComponent = {
  salary_component_id: string;
  name: string;
  type: 'earning' | 'deduction' | 'employer_contribution';
  account_id: string;
  amount: number;
};

type PreviewLine = {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  basic_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
  branch_id: string | null;
  cost_center_id: string | null;
  components: PreviewComponent[];
};

const runSchema = z.object({
  period_month: z.coerce.number().int().min(1).max(12),
  period_year: z.coerce.number().int().min(2000).max(2100),
  lines: z.array(lineInputSchema).default([]),
  post: z.boolean().default(false),
});

const paySchema = z.object({
  account_id: z.string().uuid(),
  paid_at: z.string().datetime().optional(),
});

function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

async function moneyAccountChartAccount(db: any, companyId: string, accountId: string) {
  const account = await db.query(
    `SELECT a.type, s.cash_account_id, s.bank_account_id, s.wallet_account_id
     FROM accounts a JOIN accounting_settings s ON s.company_id = a.company_id
     WHERE a.id = $1 AND a.company_id = $2 AND a.is_active = TRUE`,
    [accountId, companyId],
  );
  if (!account.rowCount) throw badRequest('Active payment account not found');
  return account.rows[0].type === 'bank' ? account.rows[0].bank_account_id : account.rows[0].type === 'wallet' ? account.rows[0].wallet_account_id : account.rows[0].cash_account_id;
}

async function payrollPreview(db: any, companyId: string, body: z.infer<typeof runSchema>) {
  const employees = await db.query(
    `SELECT * FROM employees WHERE company_id = $1 AND status = 'active' ORDER BY employee_code`,
    [companyId],
  );
  const components = await db.query(`SELECT * FROM salary_components WHERE company_id = $1 AND is_active = TRUE`, [companyId]);
  const componentMap = new Map(components.rows.map((c: any) => [c.id, c]));
  const inputMap = new Map(body.lines.map((l) => [l.employee_id, l.components]));
  const mappedLines: PreviewLine[] = employees.rows.map((emp: any) => {
    const componentRows = (inputMap.get(emp.id) ?? []).map((item) => {
      const comp: any = componentMap.get(item.salary_component_id);
      if (!comp) throw badRequest('Invalid salary component');
      return { salary_component_id: comp.id, name: comp.name, type: comp.type, account_id: comp.account_id, amount: round2(item.amount) };
    }).filter((item): item is PreviewComponent => item.amount > 0);
    const earnings = componentRows.filter((c) => c.type === 'earning').reduce((s, c) => s + c.amount, 0);
    const deductions = componentRows.filter((c) => c.type === 'deduction').reduce((s, c) => s + c.amount, 0);
    const basic = round2(Number(emp.basic_salary));
    const totalEarnings = round2(basic + earnings);
    const totalDeductions = round2(deductions);
    return {
      employee_id: emp.id,
      employee_code: emp.employee_code,
      employee_name: emp.name,
      basic_salary: basic,
      total_earnings: totalEarnings,
      total_deductions: totalDeductions,
      net_salary: round2(totalEarnings - totalDeductions),
      branch_id: emp.branch_id,
      cost_center_id: emp.cost_center_id,
      components: componentRows,
    };
  });
  const lines = mappedLines.filter((line) => line.basic_salary > 0 || line.components.length > 0);
  const totals = lines.reduce((sum, line) => {
    sum.basic_salary += line.basic_salary;
    sum.total_earnings += line.total_earnings;
    sum.total_deductions += line.total_deductions;
    sum.net_salary += line.net_salary;
    sum.employer_contributions += line.components.filter((c) => c.type === 'employer_contribution').reduce((s, c) => s + c.amount, 0);
    return sum;
  }, { basic_salary: 0, total_earnings: 0, total_deductions: 0, net_salary: 0, employer_contributions: 0 });
  return { lines, totals };
}

r.get('/employees', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`SELECT e.*, b.name AS branch_name, cc.name AS cost_center_name FROM employees e LEFT JOIN branches b ON b.id=e.branch_id LEFT JOIN cost_centers cc ON cc.id=e.cost_center_id WHERE e.company_id=$1 ORDER BY e.employee_code`, [t.companyId]);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/employees', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const b = employeeSchema.parse(req.body);
    await assertBranch(t.db, t.companyId, b.branch_id);
    await assertCostCenter(t.db, t.companyId, b.cost_center_id);
    const rs = await t.db.query(
      `INSERT INTO employees (company_id, employee_code, name, phone, email, national_id, hire_date, status, branch_id, cost_center_id, basic_salary, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [t.companyId, b.employee_code, b.name, b.phone ?? null, b.email ?? null, b.national_id ?? null, b.hire_date, b.status, b.branch_id ?? null, b.cost_center_id ?? null, b.basic_salary, b.notes ?? null],
    );
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'employee.create', entity: 'employee', entityId: rs.rows[0].id });
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.patch('/employees/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const b = employeeSchema.partial().parse(req.body);
    if (b.branch_id !== undefined) await assertBranch(t.db, t.companyId, b.branch_id);
    if (b.cost_center_id !== undefined) await assertCostCenter(t.db, t.companyId, b.cost_center_id);
    const fields = Object.keys(b);
    if (!fields.length) throw badRequest('No changes supplied');
    const sets = fields.map((key, i) => `${key}=$${i + 3}`).join(', ');
    const values = fields.map((key) => (b as any)[key]);
    const rs = await t.db.query(`UPDATE employees SET ${sets}, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`, [req.params.id, t.companyId, ...values]);
    if (!rs.rowCount) throw notFound('Employee not found');
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'employee.update', entity: 'employee', entityId: req.params.id, data: b });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.get('/components', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(`SELECT sc.*, ca.code AS account_code, ca.name AS account_name FROM salary_components sc JOIN chart_accounts ca ON ca.id=sc.account_id WHERE sc.company_id=$1 ORDER BY sc.name`, [t.companyId]);
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.post('/components', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const b = componentSchema.parse(req.body);
    const acc = await t.db.query(`SELECT 1 FROM chart_accounts WHERE id=$1 AND company_id=$2`, [b.account_id, t.companyId]);
    if (!acc.rowCount) throw badRequest('Invalid account');
    const rs = await t.db.query(`INSERT INTO salary_components (company_id, name, type, account_id, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [t.companyId, b.name, b.type, b.account_id, b.is_active]);
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'salary_component.create', entity: 'salary_component', entityId: rs.rows[0].id });
    res.status(201).json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.patch('/components/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const b = componentSchema.partial().parse(req.body);
    if (b.account_id) {
      const acc = await t.db.query(`SELECT 1 FROM chart_accounts WHERE id=$1 AND company_id=$2`, [b.account_id, t.companyId]);
      if (!acc.rowCount) throw badRequest('Invalid account');
    }
    const fields = Object.keys(b);
    if (!fields.length) throw badRequest('No changes supplied');
    const sets = fields.map((key, i) => `${key}=$${i + 3}`).join(', ');
    const values = fields.map((key) => (b as any)[key]);
    const rs = await t.db.query(`UPDATE salary_components SET ${sets}, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`, [req.params.id, t.companyId, ...values]);
    if (!rs.rowCount) throw notFound('Salary component not found');
    await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'salary_component.update', entity: 'salary_component', entityId: req.params.id, data: b });
    res.json({ data: rs.rows[0] });
  } catch (e) { next(e); }
});

r.get('/runs', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const rs = await t.db.query(
      `SELECT pr.*, COUNT(prl.id)::int AS employee_count, COALESCE(SUM(prl.net_salary),0) AS net_total
       FROM payroll_runs pr LEFT JOIN payroll_run_lines prl ON prl.payroll_run_id=pr.id
       WHERE pr.company_id=$1 GROUP BY pr.id ORDER BY pr.period_year DESC, pr.period_month DESC`,
      [t.companyId],
    );
    res.json({ data: rs.rows });
  } catch (e) { next(e); }
});

r.get('/runs/:id', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const run = await t.db.query(`SELECT * FROM payroll_runs WHERE id=$1 AND company_id=$2`, [req.params.id, t.companyId]);
    if (!run.rowCount) throw notFound('Payroll run not found');
    const lines = await t.db.query(
      `SELECT prl.*, e.employee_code, e.name AS employee_name,
              COALESCE(json_agg(json_build_object('name', sc.name, 'type', sc.type, 'amount', plc.amount)) FILTER (WHERE plc.id IS NOT NULL), '[]') AS components
       FROM payroll_run_lines prl
       JOIN employees e ON e.id=prl.employee_id
       LEFT JOIN payroll_line_components plc ON plc.payroll_run_line_id=prl.id
       LEFT JOIN salary_components sc ON sc.id=plc.salary_component_id
       WHERE prl.company_id=$1 AND prl.payroll_run_id=$2
       GROUP BY prl.id, e.employee_code, e.name ORDER BY e.employee_code`,
      [t.companyId, req.params.id],
    );
    res.json({ data: { ...run.rows[0], lines: lines.rows } });
  } catch (e) { next(e); }
});

r.post('/preview', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const b = runSchema.parse(req.body);
    res.json({ data: await payrollPreview(t.db, t.companyId, b) });
  } catch (e) { next(e); }
});

async function postPayroll(db: any, companyId: string, runId: string, userId?: string | null) {
  const run = await db.query(`SELECT * FROM payroll_runs WHERE id=$1 AND company_id=$2 FOR UPDATE`, [runId, companyId]);
  if (!run.rowCount) throw notFound('Payroll run not found');
  if (run.rows[0].status === 'posted' && run.rows[0].journal_entry_id) return run.rows[0].journal_entry_id;
  if (run.rows[0].status !== 'draft') throw conflict('Only draft payroll runs can be posted');
  const entryDate = monthEnd(Number(run.rows[0].period_year), Number(run.rows[0].period_month));
  await assertPeriodOpen(db, companyId, entryDate);
  const settings = await getSettings(db, companyId);
  const lines = await db.query(
    `SELECT prl.*, e.name AS employee_name,
            COALESCE(json_agg(json_build_object('type', sc.type, 'account_id', sc.account_id, 'amount', plc.amount, 'name', sc.name)) FILTER (WHERE plc.id IS NOT NULL), '[]') AS components
     FROM payroll_run_lines prl JOIN employees e ON e.id=prl.employee_id
     LEFT JOIN payroll_line_components plc ON plc.payroll_run_line_id=prl.id
     LEFT JOIN salary_components sc ON sc.id=plc.salary_component_id
     WHERE prl.company_id=$1 AND prl.payroll_run_id=$2
     GROUP BY prl.id, e.name`,
    [companyId, runId],
  );
  const journalLines: any[] = [];
  for (const line of lines.rows) {
    if (Number(line.basic_salary) > 0) journalLines.push({ accountId: settings.salaries_expense_account_id, debit: Number(line.basic_salary), description: `Basic salary ${line.employee_name}`, branchId: line.branch_id, costCenterId: line.cost_center_id });
    for (const comp of line.components) {
      const amount = Number(comp.amount ?? 0);
      if (amount <= 0) continue;
      if (comp.type === 'earning') journalLines.push({ accountId: comp.account_id, debit: amount, description: comp.name, branchId: line.branch_id, costCenterId: line.cost_center_id });
      if (comp.type === 'deduction') journalLines.push({ accountId: comp.account_id, credit: amount, description: comp.name, branchId: line.branch_id, costCenterId: line.cost_center_id });
      if (comp.type === 'employer_contribution') {
        journalLines.push({ accountId: settings.salaries_expense_account_id, debit: amount, description: comp.name, branchId: line.branch_id, costCenterId: line.cost_center_id });
        journalLines.push({ accountId: comp.account_id, credit: amount, description: comp.name, branchId: line.branch_id, costCenterId: line.cost_center_id });
      }
    }
    if (Number(line.net_salary) > 0) journalLines.push({ accountId: settings.employee_payables_account_id, credit: Number(line.net_salary), description: `Net salary ${line.employee_name}`, branchId: line.branch_id, costCenterId: line.cost_center_id });
  }
  const je = await createJournalEntry(db, { companyId, entryDate, memo: `Payroll ${run.rows[0].period_year}-${String(run.rows[0].period_month).padStart(2, '0')}`, source: { type: 'payroll_run', id: runId }, userId, lines: journalLines });
  await db.query(`UPDATE payroll_runs SET status='posted', posted_at=NOW(), posted_by=$3, journal_entry_id=$4, updated_at=NOW() WHERE id=$1 AND company_id=$2`, [runId, companyId, userId ?? null, je.id]);
  return je.id;
}

r.post('/runs', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const b = runSchema.parse(req.body);
    const entryDate = monthEnd(b.period_year, b.period_month);
    await assertPeriodOpen(t.db, t.companyId, entryDate);
    const preview = await payrollPreview(t.db, t.companyId, b);
    if (!preview.lines.length) throw badRequest('No payroll lines to create');
    await t.db.query('BEGIN');
    try {
      const run = await t.db.query(`INSERT INTO payroll_runs (company_id, period_month, period_year, run_date, status, created_by) VALUES ($1,$2,$3,NOW(),'draft',$4) RETURNING *`, [t.companyId, b.period_month, b.period_year, req.auth!.userId]);
      for (const line of preview.lines) {
        const ins = await t.db.query(
          `INSERT INTO payroll_run_lines (company_id, payroll_run_id, employee_id, basic_salary, total_earnings, total_deductions, net_salary, branch_id, cost_center_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [t.companyId, run.rows[0].id, line.employee_id, line.basic_salary, line.total_earnings, line.total_deductions, line.net_salary, line.branch_id ?? null, line.cost_center_id ?? null],
        );
        for (const comp of line.components) await t.db.query(`INSERT INTO payroll_line_components (company_id, payroll_run_line_id, salary_component_id, amount) VALUES ($1,$2,$3,$4)`, [t.companyId, ins.rows[0].id, comp.salary_component_id, comp.amount]);
      }
      if (b.post) await postPayroll(t.db, t.companyId, run.rows[0].id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: b.post ? 'payroll.post' : 'payroll.create', entity: 'payroll_run', entityId: run.rows[0].id });
      await t.db.query('COMMIT');
      res.status(201).json({ data: run.rows[0] });
    } catch (e) { await t.db.query('ROLLBACK'); throw e; }
  } catch (e) { next(e); }
});

r.post('/runs/:id/post', async (req, res, next) => {
  try {
    const t = req.tenant!;
    await t.db.query('BEGIN');
    try {
      const journalEntryId = await postPayroll(t.db, t.companyId, req.params.id, req.auth!.userId);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'payroll.post', entity: 'payroll_run', entityId: req.params.id });
      await t.db.query('COMMIT');
      res.json({ data: { journal_entry_id: journalEntryId } });
    } catch (e) { await t.db.query('ROLLBACK'); throw e; }
  } catch (e) { next(e); }
});

r.post('/runs/:id/pay', async (req, res, next) => {
  try {
    const t = req.tenant!;
    const b = paySchema.parse(req.body);
    const paidAt = b.paid_at ?? new Date().toISOString();
    await assertPeriodOpen(t.db, t.companyId, paidAt);
    await t.db.query('BEGIN');
    try {
      const run = await t.db.query(`SELECT * FROM payroll_runs WHERE id=$1 AND company_id=$2 FOR UPDATE`, [req.params.id, t.companyId]);
      if (!run.rowCount) throw notFound('Payroll run not found');
      if (run.rows[0].status !== 'posted') throw conflict('Only posted unpaid payroll can be paid');
      const total = await t.db.query(`SELECT COALESCE(SUM(net_salary),0) AS amount FROM payroll_run_lines WHERE payroll_run_id=$1 AND company_id=$2`, [req.params.id, t.companyId]);
      const amount = round2(Number(total.rows[0].amount));
      const settings = await getSettings(t.db, t.companyId);
      const cashAccount = await moneyAccountChartAccount(t.db, t.companyId, b.account_id);
      const je = await createJournalEntry(t.db, {
        companyId: t.companyId,
        entryDate: paidAt,
        memo: `Payroll payment ${run.rows[0].period_year}-${String(run.rows[0].period_month).padStart(2, '0')}`,
        source: { type: 'payroll_payment', id: req.params.id },
        userId: req.auth!.userId,
        lines: [
          { accountId: settings.employee_payables_account_id, debit: amount, description: 'Payroll payment' },
          { accountId: cashAccount, credit: amount, description: 'Payroll payment' },
        ],
      });
      await t.db.query(`UPDATE accounts SET balance = balance - $1 WHERE id=$2 AND company_id=$3`, [amount, b.account_id, t.companyId]);
      await t.db.query(`UPDATE payroll_runs SET status='paid', paid_at=$3, payment_account_id=$4, payment_journal_entry_id=$5, updated_at=NOW() WHERE id=$1 AND company_id=$2`, [req.params.id, t.companyId, paidAt, b.account_id, je.id]);
      await audit(t.db, { companyId: t.companyId, userId: req.auth!.userId, action: 'payroll.pay', entity: 'payroll_run', entityId: req.params.id, data: { account_id: b.account_id, amount } });
      await t.db.query('COMMIT');
      res.json({ data: { journal_entry_id: je.id } });
    } catch (e) { await t.db.query('ROLLBACK'); throw e; }
  } catch (e) { next(e); }
});

export default r;
