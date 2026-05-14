import { pool } from './client.js';

async function main() {
  console.log('[reset] dropping schema public…');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  console.log('[reset] done. Run `npm run db:migrate` next.');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
