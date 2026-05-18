import app from './app.js';
import { logger } from './utils/logger.js';
import { startJobs } from './jobs/overdue.js';
import { startEmailWorker, stopEmailQueue } from './utils/emailQueue.js';
import { env } from './config/env.js';
import { runMigrations } from './db/migrate.js';

const port = env.PORT;

// Run any pending SQL migrations before accepting requests so that
// deploying a new build automatically applies schema changes (including
// the public_get_invoice function required by the public invoice page).
try {
  await runMigrations();
} catch (err) {
  logger.error({ err }, '[startup] Migration failed — aborting server start');
  process.exit(1);
}

const server = app.listen(port, () => {
  logger.info({ port }, 'hesabat-api listening');
  if (env.RUN_JOBS) startJobs();
  void startEmailWorker();
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close();
  await stopEmailQueue();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
