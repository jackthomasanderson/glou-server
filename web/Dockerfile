FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci
ARG NEXT_PUBLIC_API_URL=http://api:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY . .
# #466: contracts shared with the API, imported as @shared/* -> ../shared
# (= /shared from WORKDIR /app). Named build context "shared", see
# docker-compose.e2e.yml / docker-publish.yml. By hand:
# docker build --build-context shared=./shared ./web
COPY --from=shared . /shared
RUN npm run build

# ─── Production image ────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

RUN addgroup -g 1001 glou && adduser -u 1001 -G glou -s /bin/sh -D glou

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder --chown=glou:glou /app/.next/standalone ./
COPY --from=builder --chown=glou:glou /app/.next/static ./.next/static

USER glou

EXPOSE 3000

CMD ["node", "server.js"]
