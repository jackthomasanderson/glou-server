# Changelog technique

Ce fichier recense les changements **transverses** (sécurité, modèle de données, infrastructure) qui ne correspondent pas au format fonctionnel `.vibe/features/FEAT-XX` (orienté utilisateur final). Pour le suivi des fonctionnalités livrées, voir `.vibe/features/features_summary.txt` et les tickets `feature.md` associés.

Format : entrées courtes et factuelles, groupées par catégorie, non datées individuellement (voir historique Git pour la datation précise par commit).

## Sécurité

- **Upload de fichiers** : l'extension du fichier stocké est désormais dérivée du `mimetype` validé côté serveur, et non plus de `originalname` (contrôlé par le client) — empêche l'upload d'un fichier exécutable déguisé sous une extension image. Voir `api/src/middleware/upload.middleware.ts`.
- **SSRF sur la récupération d'images externes** : le fetch d'images distantes utilise désormais `redirect: 'manual'` avec revalidation de sécurité à chaque saut de redirection (`resolveSafeUrl`), au lieu de suivre les redirections automatiquement. Voir `api/src/routes/search.router.ts`.
- **Secrets Docker obligatoires en production** : ajout de `assertSecretsConfigured()` dans `api/src/index.ts`, qui fait échouer le démarrage du serveur si les secrets requis (JWT, session, etc.) ne sont pas configurés en environnement de production, plutôt que de démarrer avec des valeurs par défaut non sécurisées.
- **Révocation de session au changement d'identifiants** : changement de mot de passe ou désactivation de la 2FA révoque désormais automatiquement toutes les autres sessions actives de l'utilisateur (hors session courante). Voir `revokeOtherSessions()` dans `api/src/services/auth.service.ts` (raison d'audit : `bulk_revoke_on_credential_change`).
- **Scan d'étiquette (upload)** : ajout d'un rate limiting sur l'endpoint de scan et d'une purge automatique des fichiers image après une fenêtre de rétention de 24h (`purgeExpiredScanFiles`, câblée dans le service de maintenance). Voir `api/src/services/scan.service.ts`.
- **Partage invité (`GuestShare`)** : le token de partage est désormais stocké sous forme de hash SHA-256 en base plutôt qu'en clair, avec un rate limiter dédié par IP sur l'endpoint de résolution d'un partage invité. Voir `api/src/services/shares.service.ts` et `api/src/routes/guest.router.ts`.

## Modèle de données

- **Renommage de champs d'audit** : les colonnes `startedBy` (`InventoryCountSession`), `triggeredBy` (`MaintenanceRun`, `BackupRun`) et `createdBy` (`GuestShare`) ont été uniformisées sous le nom `userId` sur les quatre modèles, pour cohérence avec le reste du schéma.
- **Conversion de champs `String` en enums Prisma** : plusieurs champs texte libre ont été convertis en enums typés pour garantir l'intégrité des valeurs stockées (voir `api/prisma/schema.prisma` pour la liste complète des enums : `CellarType`, `AccessMode`, `RunTrigger`, `InventoryCountSessionStatus`, `WishlistStatus`, `InventoryCountEntryStatus`, `HumidorReadingSource`, etc.).
- **Suppression d'index redondants** : suppression des index `bottles_userId_idx`, `sessions_userId_idx` et `wishlist_items_userId_idx`, jugés redondants avec d'autres index composites déjà en place. Voir migration `20260804040000_drop_redundant_userid_indexes`.

## Infrastructure

- **Limites mémoire Docker par service** : ajout de `mem_limit` configurable par variable d'environnement pour chaque service (`DB_MEM_LIMIT`, `API_MEM_LIMIT`, `WEB_MEM_LIMIT`, `OLLAMA_MEM_LIMIT`, etc.) dans `docker-compose.yml`.
- **Tuning Ollama** : configuration de `OLLAMA_KEEP_ALIVE` (déchargement du modèle après 5 minutes d'inactivité) et `OLLAMA_MAX_LOADED_MODELS` (limite à 1 modèle chargé simultanément) pour maîtriser l'empreinte mémoire sur un déploiement à ressources contraintes.
- **Tuning PostgreSQL** : ajustement de `max_connections` (100 → 20) et `shared_buffers` (128MB → 64MB) par rapport aux valeurs par défaut de l'image Postgres 15, dimensionné pour un déploiement de type auto-hébergé/domestique plutôt qu'un serveur générique.
- **Build Next.js forcé en mode Webpack** : `next build --webpack` (au lieu du bundler par défaut de Next.js 16) pour compatibilité avec la configuration PWA existante. Voir `web/package.json`.

---

*Ce fichier est maintenu manuellement. Il ne remplace pas l'historique Git (`git log`) mais en résume les changements structurants qui ne rentrent pas dans le cycle de vie standard d'une fonctionnalité `.vibe/features`.*
