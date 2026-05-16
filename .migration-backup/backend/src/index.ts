import { createApp } from './app.js';
import { env } from './config/env.js';
import { startJobs } from './jobs/overdue.js';
import { startEmailWorker, stopEmailQueue } from './utils/emailQueue.js';
import { logger } from './utils/logger.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, runJobs: env.RUN_JOBS }, 'hesabat-api listening');
  // SCL-06: only one replica should tick scheduled jobs. Set RUN_JOBS=false
  // on additional replicas (or run jobs in a dedicated worker process).
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


