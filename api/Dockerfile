FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Production image ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Non-root user
# postgresql15-client (pinned, not the generic "postgresql-client" alias):
# provides pg_dump/pg_restore/psql for the scheduled backup job (FEAT-18, see
# design.md "Sauvegarde & Migration"). Must match the server major version
# (postgres:15-alpine in docker-compose.yml) — the unversioned Alpine package
# tracks whatever major is current in that Alpine release's repo, which can
# silently drift ahead of 15 and cause pg_dump/pg_restore compatibility issues.
RUN apk add --no-cache openssl postgresql15-client && \
    addgroup -g 1001 glou && adduser -u 1001 -G glou -s /bin/sh -D glou

WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# /app/backups (FEAT-18): destination of scheduled pg_dump files. Mounted on
# its own named volume (see docker-compose.yml), distinct from /app/uploads,
# so backups persist independently and survive an application-volume reset.
RUN mkdir -p /app/logs /app/uploads/products /app/uploads/avatars /app/backups && chown -R glou:glou /app

USER glou

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
