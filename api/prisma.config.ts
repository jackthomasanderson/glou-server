import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 moved connection URLs and the seed command out of schema.prisma /
// package.json into this file (see https://pris.ly/prisma-config).
//
// `datasource.url` is only consumed by the commands that actually talk to the
// database (`migrate`, `db push`, `db seed`, `studio`, ...). `prisma generate`
// — which runs in CI and in the Docker build stage with no DATABASE_URL in the
// environment — still loads this file, so we read the variable defensively via
// `process.env` (falling back to an empty string) instead of the `env()` helper,
// which throws when the variable is unset.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx ts-node --transpile-only prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
