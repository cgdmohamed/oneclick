import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'migrations');

async function main() {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  console.log(`[migrate] applying ${files.length} migration(s)…`);
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`  → ${f}`);
    await pool.query(sql);
  }
  console.log('[migrate] done.');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
