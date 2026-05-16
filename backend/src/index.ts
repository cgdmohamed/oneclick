import { createApp } from './app.js';
import { env } from './config/env.js';
import { startJobs } from './jobs/overdue.js';
import { startEmailWorker, stopEmailQueue } from './utils/emailQueue.js';
import { logger } from './utils/logger.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'hesabat-api listening');
  startJobs();
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


