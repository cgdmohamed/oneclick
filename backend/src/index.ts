import { createApp } from './app.js';
import { env } from './config/env.js';
import { startJobs } from './jobs/overdue.js';

const app = createApp();
app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[hesabat-api] listening on http://localhost:${env.PORT}`);
  startJobs();
});
