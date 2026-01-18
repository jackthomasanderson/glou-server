# Quick Start

## TL;DR
Run with Docker. Access at `http://localhost:3000`.

## Prerequisites
- Docker & Docker Compose installed.

## Action
1. Create `.env` file (copy from README).
2. Start database:
   ```bash
   docker compose up -d db
   ```
3. Start services:
   ```bash
   docker compose up -d
   ```
4. Access:
   - Web: `http://localhost:3000`
   - API: `http://localhost:3001/api`

## Troubleshooting
| Error | Check |
|-------|-------|
| `Connection refused` | Is Docker running? Are ports 3000/3001 free? |
| `DB connection failed` | Check `DB_HOST`, `DB_USER`, `DB_PASSWORD` in `.env`. |
