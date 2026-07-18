import { badRequest } from './errors.js';

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }>;
};

export async function assertBranch(db: Queryable, companyId: string, branchId?: string | null) {
  if (!branchId) return;
  const rs = await db.query(`SELECT 1 FROM branches WHERE id = $1 AND company_id = $2`, [branchId, companyId]);
  if (!rs.rowCount) throw badRequest('Invalid branch');
}

export async function assertCostCenter(db: Queryable, companyId: string, costCenterId?: string | null) {
  if (!costCenterId) return;
  const rs = await db.query(`SELECT 1 FROM cost_centers WHERE id = $1 AND company_id = $2`, [costCenterId, companyId]);
  if (!rs.rowCount) throw badRequest('Invalid cost center');
}
