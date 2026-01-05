# Caves : créer, éditer, supprimer

## TL;DR
Les caves se gèrent depuis `/dashboard/caves` avec nom, type, description et localisation facultative.
Pas d'association automatique avec les bouteilles pour l'instant : les stocks restent séparés.

## Prérequis
- Être connecté; le proxy `/api/caves` doit pointer sur l'API (port 3001 par défaut).
- Postgres en ligne (table `caves` créée par `db/init/04-feat-24-caves.sql`).
- Navigateur autorisé à conserver le cookie `session_token`.

> [!CAUTION]
> La suppression de cave est définitive côté API et ne déclenche pas de réassignation de bouteilles.

## Action
1. Ouvrez `/dashboard/caves` et cliquez sur « + Nouvelle cave ».
2. Renseignez le nom (obligatoire) et choisissez un type parmi cellar/showcase/climate_cabinet/rack/other; description et localisation sont optionnelles.
3. Validez : l'UI met la cave en cache (optimistic) puis la sauvegarde via l'API.
4. Consultez une cave via le bouton Voir; ajustez les champs puis enregistrez pour envoyer un PUT `/api/caves/{id}`.
5. Supprimez une cave via le bouton Supprimer; l'API fait un delete immédiat (pas de corbeille).

## Pourquoi ça ne marche pas ?
- 401/403 : session expirée ou cookie absent; reconnectez-vous via `/login`.
- 400 « Invalid input » : `name` vide ou `caveType` hors de l'énumération attendue.
- 404 en édition : l'identifiant n'existe plus (supprimé ou non lié à votre compte).
- Pas de compteur de bouteilles : l'API n'expose pas encore les statistiques de cave; c'est attendu dans cet état du code.
