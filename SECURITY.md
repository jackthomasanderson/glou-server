# Security Policy

*[Version française](SECURITY_FR.md)*

## Supported versions

Glou is distributed as rolling Docker images. Only the latest published tags receive security fixes:

| Tag | Branch | Supported |
| --- | --- | --- |
| `latest` | `main` | ✅ |
| `beta` | `dev` | ✅ (pre-release) |
| older digests | — | ❌ |

Always run the most recent image: `docker compose pull && docker compose up -d`.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately through GitHub's private vulnerability reporting:

1. Go to the [Security advisories page](https://github.com/jackthomasanderson/glou-server/security/advisories/new).
2. Describe the issue, affected version/tag, impact, and reproduction steps.
3. Include a proof of concept if you have one.

You can expect an acknowledgement within a few days. Once a fix is available we will publish a patched image and, with your permission, credit you in the advisory.

## Scope

In scope: the `api/` and `web/` code in this repository and the default `docker-compose.yml` stack.

Out of scope: issues that require a misconfigured deployment (for example a weak or default `JWT_SECRET`, an exposed database port, or a missing reverse-proxy TLS), third-party services (Vivino, Whiskybase, DuckDuckGo, Ollama), and vulnerabilities in dependencies that are already tracked upstream without a Glou-specific impact.

## Hardening reminders for operators

- Set a strong, unique `JWT_SECRET` (`openssl rand -hex 32`). There is no safe default.
- Never expose the PostgreSQL port publicly.
- Terminate TLS at a reverse proxy and set the public URL configuration accordingly.
- Keep the stack updated.
