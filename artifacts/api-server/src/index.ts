import app from './app.js';
import { logger } from './utils/logger.js';
import { startJobs } from './jobs/overdue.js';
import { startEmailWorker, stopEmailQueue } from './utils/emailQueue.js';
import { env } from './config/env.js';
import { runMigrations } from './db/migrate.js';

const port = env.PORT;

// Last line of defense: a bug anywhere outside an Express request handler
// (a background job, a queue worker callback) must never crash the whole
// server for every user with no explanation — log it with full detail for
// diagnosis and keep serving requests. Express route errors never reach
// here; they go through errorHandler in middleware/error.ts.
process.on('uncaughtException', (err) => {
  logger.error({ err }, '[fatal] uncaught exception — server continues running');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[fatal] unhandled promise rejection — server continues running');
});

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
