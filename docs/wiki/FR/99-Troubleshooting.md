# Dépannage

## TL;DR
Scénarios de réparation courants.

## Problèmes Courants

| Problème | Code | Solution |
|----------|------|----------|
| Échec Connexion | 401 | Vérifier user/pass. Si 2FA actif, vérifier synchro heure. |
| Erreur Réseau | 500s | Vérifier logs API (`docker compose logs api`). Base de données UP ? |
| Images non chargées | 404 | Vérifier montages volume dans `docker-compose.yml`. |
| "Failed to fetch" | CORS | Vérifier `CORS_ORIGIN` correspond à l'URL frontend. |

> [!TIP]
> Toujours vérifier les logs serveur d'abord : `docker compose logs -f`.
