-- Remove orphaned user_companies rows that point to a company_id that no
-- longer exists in the companies table. These stale references cause
-- GET /api/companies/me to return 404 for affected users, making all
-- company settings appear to silently fail to save.
--
-- Safe to re-run: deletes nothing if no orphans exist.

DELETE FROM user_companies
WHERE company_id NOT IN (SELECT id FROM companies);
