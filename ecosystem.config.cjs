// PM2 ecosystem config for ون كليك (Hesabat)
//
// Usage:
//   pm2 start ecosystem.config.cjs --env production
//   pm2 save && pm2 startup   (to persist across reboots)
//
// Before starting, build both packages:
//   pnpm --filter @workspace/hesabat run build
//   pnpm --filter @workspace/api-server run build

module.exports = {
  apps: [
    {
      name: 'oneclick-api',
      script: 'dist/index.mjs',
      cwd: 'artifacts/api-server',
      interpreter: 'node',
      env_production: {
        NODE_ENV: 'production',
        PORT: 7000,
        // DATABASE_URL: 'postgres://user:password@localhost:5432/hesabat',
        // JWT_SECRET: '<random-string-min-32-chars>',
        // JWT_REFRESH_SECRET: '<different-random-string-min-32-chars>',
        // CORS_ORIGIN: 'same-origin',
      },
    },
  ],
};
