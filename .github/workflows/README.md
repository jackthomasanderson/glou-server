# GitHub Actions workflows

This repository has two workflows: `docker-publish.yml` (tests, end-to-end checks, image publishing) and `nightly-e2e-fuzz.yml` (scheduled UI fuzzing).

## `docker-publish.yml` — Build & Publish Docker Images

**Triggers**
- `pull_request` targeting `main`, `dev`, `feat/families` or `feat/slots`: runs `test` and `e2e` only.
- `push` on `main` or `dev`: runs everything, including publishing.

A new run cancels the in-progress run of the same ref only for pull requests. The default `GITHUB_TOKEN` permission is `contents: read`; only `build-and-push` and `publish-manifest` get `packages: write`.

**Jobs, in order**

1. `test`: secrets scan (gitleaks CLI, `--no-git`), `npm audit --omit=dev --audit-level=critical` for `api/` and `web/`, Prisma client generation, typecheck, lint and unit tests for both packages, then the `THIRD_PARTY_NOTICES.md` check (below).
2. `e2e` (needs `test`): typechecks the specs, builds `docker-compose.e2e.yml`, starts the stack, runs the SQL migration benches and shell checks (`e2e/migration/`, `e2e/check-*.sh`), then the Playwright user-journey suite inside Playwright's official image (20 min timeout). The fuzz spec `monkey.spec.ts` is not part of it.
3. `build-and-push` (needs `test` and `e2e`, pushes only): one job per image (`api`, `web`) and architecture (`amd64`, `arm64`), each on a native runner (`ubuntu-latest` and `ubuntu-24.04-arm`), 45 min timeout. Each pushes its image by digest only. Provenance and SBOM are enabled.
4. `publish-manifest` (needs `build-and-push`): per image, joins the two digests into one multi-arch manifest and pushes the tags.

There is no QEMU emulation: the arm64 images are built on an arm64 runner. A full run is still long, mainly because of `e2e` and the image builds.

**Required checks for merging into `dev` and `main`** (branch rulesets): `test`, `e2e` and `license/cla` (from the CLA assistant, not a workflow of this repository). `build-and-push` and `publish-manifest` do not run on pull requests.

## Published images

Pushed to `ghcr.io/jackthomasanderson/glou-server-api` and `ghcr.io/jackthomasanderson/glou-server-web`, authenticated with `GITHUB_TOKEN` (no secret to create):

| Branch | Tags |
| --- | --- |
| `dev` | `beta`, `sha-<full commit>` |
| `main` | `latest`, `v<version of api/package.json>`, `sha-<full commit>` |

## Artifacts

Download with `gh run download <run-id> -n <name>`:

- `third-party-notices` (7 days): uploaded when the notices check fails; contains the regenerated `THIRD_PARTY_NOTICES.md`, ready to commit.
- `playwright-report` (7 days): the Playwright report of the `e2e` job, uploaded unless the run was cancelled.
- `fuzz-report` (14 days): same, for the nightly fuzz.

## Things that break the `test` job

- **`THIRD_PARTY_NOTICES.md`**: the job runs `node scripts/generate-notices.mjs` and fails if the file differs. It happens when production dependencies change without regenerating the file; take the `third-party-notices` artifact or run the script.
- **gitleaks allowance**: `.gitleaksignore` allows the throwaway `CONFIG_ENCRYPTION_KEY` of `docker-compose.e2e.yml` by line number (`docker-compose.e2e.yml:generic-api-key:43`). Inserting or removing a line above it in that file breaks the `test` job unless the number in `.gitleaksignore` is updated.

## `nightly-e2e-fuzz.yml` — Nightly UI Fuzz (gremlins)

- **Triggers**: schedule at 03:17 UTC daily, and manual `workflow_dispatch` with an optional `seed`.
- **Job `fuzz`** (a single job): builds and starts the E2E stack, then runs `monkey.spec.ts` (gremlins clicking at random) with `E2E_MONKEY=1`, 30 min timeout. A failure means a page threw an uncaught exception, logged a console error or hit a crash screen.
- **Seed**: the run number by default, or the `seed` input to replay a given run.
- **On failure of a scheduled run**: opens an issue titled "Nightly fuzz failed", or comments on it if already open.

## Files not pushed to this public repository

`.github/agents/`, `.github/rules/` and `.claude/` (the development pipeline) are listed in `.gitignore` and are not pushed to this public repository. Only `.github/workflows/` is tracked and pushed, because GitHub Actions needs it. Those local pipeline files are kept up to date by a local copy, not by a workflow.
