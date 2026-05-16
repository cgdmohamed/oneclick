import { createApp } from './app.js';
import { env } from './config/env.js';
import { startJobs } from './jobs/overdue.js';
import { startEmailWorker, stopEmailQueue } from './utils/emailQueue.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[hesabat-api] listening on http://localhost:${env.PORT}`);
  startJobs();
  void startEmailWorker();
});

async function shutdown(signal: string) {
  console.log(`[hesabat-api] received ${signal}, shutting down...`);
  server.close();
  await stopEmailQueue();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

