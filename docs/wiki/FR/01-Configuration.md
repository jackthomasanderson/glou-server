# Configuration

## TL;DR
Toute la config est dans `.env`. Aucune valeur en dur.

## Variables d'Environnement
| Variable | Description | Défaut |
|----------|-------------|--------|
| `API_PORT` | Port Backend | 3001 |
| `WEB_PORT` | Port Frontend | 3000 |
| `DB_HOST` | Hôte Postgres | localhost |
| `DB_PORT` | Port Postgres | 5432 |
| `DB_NAME` | Nom Base | glou |
| `DB_USER` | Utilisateur Base | glou |
| `DB_PASSWORD` | Mot de passe Base | glou |
| `CORS_ORIGIN` | Origine Autorisée | http://localhost:3000 |
| `NEXT_PUBLIC_API_URL` | URL Publique API | http://localhost:3001/api |

> [!CAUTION]
> Ne jamais commiter `.env` dans le gestionnaire de version.
