# Troubleshooting

## TL;DR
Common fix-it scenarios.

## Common Issues

| Issue | Code | Fix |
|-------|------|-----|
| Login Failed | 401 | Check username/password. If 2FA enabled, verify time sync. |
| Network Error | 500s | Check API logs (`docker compose logs api`). Ensure DB is up. |
| Images not loading | 404 | Check volume mounts in `docker-compose.yml`. |
| "Failed to fetch" | CORS | Verify `CORS_ORIGIN` matches your frontend URL. |

> [!TIP]
> Always check server logs first: `docker compose logs -f`.
