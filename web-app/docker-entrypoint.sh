#!/bin/sh
set -e

# Railway (and docker-compose) inject DATABASE_URL. Apply any pending
# migrations before the server starts so the schema is always current.
echo "==> Applying database migrations (prisma migrate deploy)…"
node ./node_modules/prisma/build/index.js migrate deploy

# Optional: auto-seed when SEED_ON_START=true and the DB looks empty.
if [ "${SEED_ON_START}" = "true" ]; then
  echo "==> SEED_ON_START=true — running database seed…"
  node ./node_modules/prisma/build/index.js db seed || echo "Seed skipped or failed (continuing)."
fi

echo "==> Starting server: $*"
exec "$@"
