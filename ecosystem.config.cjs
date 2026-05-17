// PM2 ecosystem config for ون كليك (Hesabat)
//
// Usage:
//   pm2 start ecosystem.config.cjs --env production
//   pm2 save && pm2 startup   (to persist across reboots)
//
// Before starting, build both packages:
//   pnpm --filter @workspace/hesabat run build
//   pnpm --filter @workspace/api-server run build
//
// Environment variables are loaded automatically from env.production in the
// project root. Edit that file to manage all secrets and config in one place.
// After changing env.production, run:
//   pm2 restart oneclick-api --update-env

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, 'env.production') });

module.exports = {
  apps: [
    {
      name: 'oneclick-api',
      script: 'dist/index.mjs',
      cwd: 'artifacts/api-server',
      interpreter: 'node',
      env_production: {
        ...process.env,
      },
    },
  ],
};
