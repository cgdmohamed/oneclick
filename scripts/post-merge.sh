#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Apply custom SQL migrations (idempotent — all use CREATE OR REPLACE)
if [ -n "$DATABASE_URL" ]; then
  for f in artifacts/api-server/src/db/migrations/*.sql; do
    echo "Applying migration: $f"
    psql "$DATABASE_URL" -f "$f"
  done
fi
