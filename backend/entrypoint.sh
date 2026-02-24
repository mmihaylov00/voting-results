#!/bin/sh
set -e

if [ -f /app/backend/prisma/schema.prisma ]; then
  echo "Running prisma generate..."
  npx prisma generate

  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy

  echo "Importing raw election data..."
  npm run import:raw-data
fi

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "Seeding admin user..."
  npm run seed
else
  echo "ADMIN_EMAIL or ADMIN_PASSWORD not set. Skipping seed."
fi

echo "Starting server..."
exec node dist/main.js
