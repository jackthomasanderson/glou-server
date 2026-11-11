FROM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS builder

# #466: /build/api + /build/shared reproduce the repository layout, so
# tsconfig's rootDir ".." emits dist/api/src/index.js and dist/shared/.
WORKDIR /build/api

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
# Prisma 7: prisma.config.ts holds the datasource URL + migration/seed config
# that used to live in schema.prisma / package.json. The CLI loads it for every
# command, including `generate` (which needs no live DB — the config reads
# DATABASE_URL defensively via process.env).
COPY prisma.config.ts ./
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
# #466: contracts shared with web/, passed as the named build context
# "shared" (docker-compose.e2e.yml additional_contexts, build-push-action
# build-contexts). By hand: docker build --build-context shared=./shared ./api
COPY --from=shared . /build/shared
RUN npm run build

# ─── IP geolocation data (#434) ──────────────────────────────────────────────
# DB-IP "IP to City Lite" (CC BY 4.0, https://db-ip.com), fetched at build time
# and never committed. Published monthly: falls back to the previous month
# early in the month, and fails the build if neither file is available.
FROM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS geo
WORKDIR /geo
RUN set -eu; \
    y=$(date -u +%Y); m=$(date -u +%m); m=${m#0}; \
    if [ "$m" -eq 1 ]; then py=$((y - 1)); pm=12; else py=$y; pm=$((m - 1)); fi; \
    for month in "$y-$(printf %02d "$m")" "$py-$(printf %02d "$pm")"; do \
      if wget -q -O dbip.mmdb.gz "https://download.db-ip.com/free/dbip-city-lite-$month.mmdb.gz" && gunzip dbip.mmdb.gz; then \
        mv dbip.mmdb dbip-city-lite.mmdb; echo "DB-IP City Lite $month"; exit 0; \
      fi; \
      rm -f dbip.mmdb.gz dbip.mmdb; \
    done; \
    echo "No DB-IP City Lite database for $y-$m or the previous month" >&2; exit 1

# ─── Production image ────────────────────────────────────────────────────────
FROM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS runner

# Non-root user
# postgresql-client: provides pg_dump/pg_restore/psql for the scheduled backup
# job (FEAT-18, see design.md "Sauvegarde & Migration"). Uses the generic
# (unversioned) Alpine package rather than a pinned "postgresqlNN-client" —
# Alpine only carries a rolling set of recent majors (e.g. 16/17/18 on the
# release this image tracks; 15 was already dropped, which broke the build
# when a specific version was hard-pinned here). This is safe: pg_dump/psql
# from a NEWER client against an OLDER server (postgres:15-alpine in
# docker-compose.yml) is the officially supported direction for backups —
# it's a newer-client-vs-newer-server pairing that would risk incompatibility,
# not this one.
RUN apk add --no-cache openssl postgresql-client && \
    addgroup -g 1001 glou && adduser -u 1001 -G glou -s /bin/sh -D glou

WORKDIR /app

# #575: instance time zone, for members' quiet hours and the cron hours.
# Compose passes TZ from .env over it. Node reads zones from its bundled ICU
# data, so no tzdata package is needed.
ENV TZ=Europe/Paris

COPY --from=builder /build/api/package*.json ./
# ISSUE_090: the CMD below invokes `npx prisma migrate deploy`, which needs
# the `prisma` CLI package itself — not just the `@prisma/client` runtime
# copied below. `prisma` lives in `dependencies` (package.json) precisely so
# this install step pulls it in; without that, `npx` would fetch it from the
# registry on every container start, making startup depend on Internet access.
RUN npm ci --omit=dev

COPY --from=builder /build/api/dist ./dist
COPY --from=builder /build/api/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /build/api/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /build/api/prisma ./prisma
# Required by `npx prisma migrate deploy` in the CMD below (Prisma 7).
COPY --from=builder /build/api/prisma.config.ts ./

# /app/backups (FEAT-18): destination of scheduled pg_dump files. Bind-mounted
# from ./backups on the host (see docker-compose.yml), which hides this
# chown: on Linux the host folder must belong to uid 1001 (#537). No
# /app/logs: logs go to stdout (#540).
RUN mkdir -p /app/uploads/products /app/uploads/avatars /app/backups && chown -R glou:glou /app

# Read-only for the app, copied after the chown so the ~120 MB file is not
# stored twice. Path read by GEO_DB_PATH's default (src/lib/device.ts).
COPY --from=geo /geo/dbip-city-lite.mmdb ./geo/dbip-city-lite.mmdb

USER glou

EXPOSE 3001

# design.md "Sauvegarde & Migration": pre-migrate.js backs the database up
# (glou-backup-before-migration-*.sql.gz in /app/backups) when migrations are
# pending on an instance in use, and exits non-zero if it cannot: then nothing
# is migrated and the API does not start.
# #673: `exec` makes Node replace the shell as PID 1, so the stop signal
# Docker sends reaches it and the graceful shutdown (ISSUE_091) runs.
CMD ["sh", "-c", "node dist/api/src/scripts/pre-migrate.js && npx prisma migrate deploy && exec node dist/api/src/index.js"]
