# Glou — AGENTS.md (Root)

Glou is a self-hosted asset manager for luxury collections (wines, spirits, bubbles, cigars). Monorepo with Node.js API backend and Next.js frontend, deployed via Docker Compose.

## Project Structure

```
/api            → Express + TypeScript REST API (port 3001)
/web            → Next.js 16 + TypeScript frontend (port 3000)
/docker-compose.yml → Full-stack deployment (Node, PostgreSQL)
/docs/wiki      → User-facing documentation (FR/EN)
/.github        → GitHub workflows and templates
```

## Tech Stack

- **Backend**: Express, TypeScript 5 (strict), Prisma ORM (PostgreSQL)
- **Frontend**: Next.js 16 (App Router), React 18, TypeScript 5 (strict), Tailwind CSS, HeroUI (heroui/react)
- **Database**: PostgreSQL (via Prisma migrations)
- **Auth**: JWT (HttpOnly cookie + Bearer header), 2FA via speakeasy (TOTP)
- **Validation**: Zod (backend), react-hook-form + zod (frontend)
- **State**: TanStack React Query v5 (frontend)
- **i18n**: i18next (FR default, EN supported)
- **Testing**: Vitest (both api/ and web/)
- **Containerization**: Docker Compose with pre-built images

## Monorepo Conventions

- Root workspace is the Docker Compose orchestration layer
- `api/` and `web/` are independent Node.js packages with their own `package.json`
- Both sub-projects use TypeScript `strict: true`, `noImplicitAny: true`, `target: ES2022`
- Environment variables from `.env` (copied from `.env.example`)
- `JWT_SECRET` has NO safe default — must be set with `openssl rand -hex 32`

## API Conventions

See [api/AGENTS.md](./api/AGENTS.md) for:
- Express router → service → Prisma architecture
- Zod validation schemas
- Auth middleware (JWT + admin)
- Soft-delete pattern (deletedAt)
- Audit logging pattern
- Error middleware (UPPER_SNAKE_CASE error codes)

## Web Conventions

See [web/AGENTS.md](./web/AGENTS.md) for:
- Next.js App Router with `@/` path aliases
- React Query hooks → API client pattern
- HeroUI component library usage
- i18n with `react-i18next`
- Tailwind dark mode ("class" strategy)
- 'use client' / 'use server' boundaries

## Database

See [api/prisma/AGENTS.md](./api/prisma/AGENTS.md) for:
- Prisma schema design (PostgreSQL)
- Migration workflow
- Seed script usage
- Model relationships and index strategy

## Component Library

See [web/components/AGENTS.md](./web/components/AGENTS.md) for:
- Domain-organized component directories
- shared/ui components (layout, navigation, notifications)
- Feature components (bottles, cellars, tastings, admin, analytics)

## Branch & Commit Conventions

- Feature branches: `feat/…` or `fix/…`
- Commits: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- PRs target `main` on upstream (`jackthomasanderson/glou-server`)
- Fork workflow: origin = personal fork, upstream = canonical repo

## Never Do

- Never commit `.env` (secrets)
- Never suppress TypeScript errors with `as any`, `@ts-ignore`, `@ts-expect-error`
- Never skip Prisma migrations — always create a new migration for schema changes
- Never modify `Dockerfile` without also updating `docker-compose.yml` if needed
- Never use `any` in API contracts — all inputs validated via Zod schemas
- Never mix French and English in code — code is English, comments may be either