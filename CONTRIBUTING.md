# Contributing to Glou

*[Version française](CONTRIBUTING_FR.md)*

Thanks for your interest in improving Glou! This document explains how to propose changes.

## Ways to contribute

- **Report a bug** — open a [bug report](https://github.com/jackthomasanderson/glou-server/issues/new?template=bug_report.yml).
- **Suggest a feature** — open a [feature request](https://github.com/jackthomasanderson/glou-server/issues/new?template=feature_request.yml).
- **Ask a question** — use [Discussions](https://github.com/jackthomasanderson/glou-server/discussions), not the issue tracker.
- **Report a vulnerability** — see [SECURITY.md](SECURITY.md). Never open a public issue for security problems.

## Project layout

| Path | Stack |
| --- | --- |
| `api/` | Node.js + TypeScript, Express, Prisma, PostgreSQL, Zod, Vitest |
| `web/` | Next.js (App Router), React Query, Tailwind CSS, HeroUI, Vitest |
| `docs/wiki/` | User documentation (FR/EN) |
| `docker-compose*.yml` | Local dev and self-hosted stack |

## Development setup

Prerequisites: Docker, and Node.js 20 if you want to run the apps outside containers.

```bash
cp .env.example .env          # set a strong JWT_SECRET
docker compose -f docker-compose.dev.yml up -d
```

To work on a package directly:

```bash
cd api && npm ci && npm run db:generate && npm run dev
cd web && npm ci && npm run dev
```

## Branching and pull requests

- The default integration branch is **`dev`**. Branch from `dev` and open your PR **against `dev`** — not `main`.
- `main` tracks released code; `dev` is promoted to `main` by the maintainer.
- Keep PRs focused. One logical change per PR.
- Use a descriptive branch name, e.g. `fix/world-map-basemap` or `feat/csv-import`.
- Fill in the PR template checklist.

## Quality gates

CI (`.github/workflows/docker-publish.yml`) runs on every push to `dev` and `main` and **must be green** before a merge. Run the same checks locally:

```bash
# api/
npm run typecheck      # tsc --noEmit — strict, no `any`
npm run lint           # eslint
npm test               # vitest

# web/
npm run lint
npm test
```

### Coding conventions

- **TypeScript strict** everywhere. `any` is not accepted — type it properly or use `unknown` with a narrowing guard.
- **Business naming in English**, explicit: `fillingLevel`, `peakMaturity`, not abbreviations.
- **Validation with Zod** for every API input and output.
- **Manual edits win**: never let automatic enrichment overwrite a field listed in `locked_fields`.
- **Database writes** that touch multiple tables go through a Prisma `$transaction`.
- **Frontend state** uses React Query with stale-while-revalidate; invalidate related caches after every successful mutation.
- Match the style of the surrounding code (naming, comments, structure).

### Internationalisation

Every user-facing string needs a structured i18n key with **both** a French and an English value. Keep the FR/EN JSON files in sync; the JSON must stay valid.

### Tests

Add or update tests for the behaviour you change. Integration tests on the data lifecycle (import → enrichment → persistence) and on `locked_fields` exclusion are the priority.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `type: summary`, e.g. `fix: bottles page ignored the user's language preference`. Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

Public repo: never reference secrets, `.env` contents, or files that are gitignored in commit messages, PR descriptions, or issue comments.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
