# Politique de sécurité

*[English version](SECURITY.md)*

## Versions supportées

Glou est distribué sous forme d'images Docker en flux continu. Seuls les derniers tags publiés reçoivent des correctifs de sécurité :

| Tag | Branche | Supporté |
| --- | --- | --- |
| `latest` | `main` | ✅ |
| `beta` | `dev` | ✅ (pré-version) |
| digests plus anciens | — | ❌ |

Utilisez toujours l'image la plus récente : `docker compose pull && docker compose up -d`.

## Signaler une faille

**N'ouvrez jamais d'issue publique pour un problème de sécurité.**

Signalez en privé via le signalement de faille de GitHub :

1. Rendez-vous sur la [page des advisories de sécurité](https://github.com/jackthomasanderson/glou-server/security/advisories/new).
2. Décrivez le problème, la version/le tag affecté, l'impact et les étapes de reproduction.
3. Joignez une preuve de concept si vous en avez une.

Vous pouvez attendre un accusé de réception sous quelques jours. Une fois un correctif disponible, nous publierons une image corrigée et, avec votre accord, vous créditerons dans l'advisory.

## Périmètre

Dans le périmètre : le code `api/` et `web/` de ce dépôt et la stack `docker-compose.yml` par défaut.

Hors périmètre : les problèmes qui nécessitent un déploiement mal configuré (par exemple un `JWT_SECRET` faible ou par défaut, un port de base de données exposé, ou l'absence de TLS au niveau du reverse proxy), les services tiers (Vivino, Whiskybase, DuckDuckGo, Ollama), et les vulnérabilités de dépendances déjà suivies en amont sans impact spécifique à Glou.

## Rappels de durcissement pour les opérateurs

- Définissez un `JWT_SECRET` fort et unique (`openssl rand -hex 32`). Il n'y a pas de valeur par défaut sûre.
- N'exposez jamais le port PostgreSQL publiquement.
- Terminez le TLS sur un reverse proxy et configurez l'URL publique en conséquence.
- Gardez la stack à jour.
