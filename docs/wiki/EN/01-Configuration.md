# Configuration

## TL;DR
All config lives in `.env`. No hardcoded values.

## Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `API_PORT` | Backend port | 3001 |
| `WEB_PORT` | Frontend port | 3000 |
| `DB_HOST` | Postgres Host | localhost |
| `DB_PORT` | Postgres Port | 5432 |
| `DB_NAME` | Database Name | glou |
| `DB_USER` | Database User | glou |
| `DB_PASSWORD` | Database Pass | glou |
| `CORS_ORIGIN` | Allowed Origin | http://localhost:3000 |
| `NEXT_PUBLIC_API_URL` | Public API URL | http://localhost:3001/api |

> [!CAUTION]
> Never commit `.env` to version control.
