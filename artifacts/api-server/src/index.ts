import app from './app.js';
import { logger } from './utils/logger.js';
import { startJobs } from './jobs/overdue.js';
import { startEmailWorker, stopEmailQueue } from './utils/emailQueue.js';
import { env } from './config/env.js';

const port = env.PORT;

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
