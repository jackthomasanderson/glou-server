# Consulter le journal d'audit des actions

## TL;DR
Accédez à `/admin`, section **Journal d'audit**, pour voir la liste paginée des actions effectuées sur l'instance : qui, quoi, statut, IP et horodatage. Réservé aux administrateurs.

## Prérequis
- Être connecté avec un compte dont `isAdmin = true`.
- Tout accès depuis un compte non-administrateur redirige vers `/`.

## Action

### 1. Accéder au journal d'audit

1. Connectez-vous avec un compte administrateur.
2. Naviguez vers `/admin`.
3. Faites défiler jusqu'à la section **Journal d'audit**.

La section est présente sur la même page que la gestion des utilisateurs et la maintenance. Aucun onglet séparé.

### 2. Lire le tableau

Chaque ligne du tableau correspond à une entrée de journal et affiche cinq colonnes :

| Colonne | Description |
| :--- | :--- |
| **Date** | Horodatage complet (date + heure) de l'action, affiché dans le fuseau horaire du navigateur. |
| **Utilisateur** | Nom d'utilisateur (`username`) de l'auteur. Affiche `-` si l'utilisateur a été supprimé. |
| **Action** | Code de l'action sous forme de chip (ex. `CREATE`, `DELETE`, `LOGIN`, `CELLAR_UPDATE`). |
| **Statut** | `success` (vert) ou `danger` (rouge) selon le résultat de l'opération. |
| **IP** | Adresse IP de la requête, en police monospace. |

Les entrées sont triées de la plus récente à la plus ancienne. La limite par défaut est **50 entrées par page**.

### 3. Naviguer entre les pages

Si le total dépasse 50 entrées, un indicateur `page X / Y (Z entrées)` apparaît en bas à droite du tableau, accompagné des boutons **<** et **>**.

> [!TIP]
> L'API accepte les paramètres `page` et `limit` : `GET /api/admin/audit-logs?page=2&limit=100`. La valeur maximale de `limit` est **100**.

### 4. Interpréter les codes d'action

Les codes d'action enregistrés dans le système :

| Code | Déclencheur |
| :--- | :--- |
| `LOGIN` | Connexion réussie |
| `LOGIN_2FA` | Connexion via authentification à deux facteurs |
| `LOGOUT` | Déconnexion |
| `REGISTER` | Création d'un compte |
| `CREATE` | Création d'une bouteille, d'un vin, etc. |
| `READ` | Lecture d'une bouteille |
| `LIST` | Liste de bouteilles |
| `UPDATE` | Modification d'une bouteille ou d'un vin |
| `DELETE` | Suppression (corbeille) d'une bouteille ou d'un vin |
| `RESTORE` | Restauration depuis la corbeille |
| `CELLAR_CREATE` | Création d'une cave |
| `CELLAR_READ` | Lecture d'une cave |
| `CELLAR_UPDATE` | Modification d'une cave |
| `CELLAR_DELETE` | Suppression d'une cave |
| `COLLECTION_CREATE` | Création d'une collection |
| `COLLECTION_UPDATE` | Modification d'une collection |
| `COLLECTION_DELETE` | Suppression d'une collection |

#### Événements de sécurité

Ce qui change qui peut entrer, et comment. Aucune entrée ne contient de mot de passe, de code ou de secret.

| Code | Déclencheur | Auteur de l'entrée |
| :--- | :--- | :--- |
| `LOGIN_FAILED` | Connexion refusée : mauvais mot de passe, mauvais code de double authentification, ou compte désactivé (`details.reason`). Un identifiant inconnu n'est pas enregistré : ce qui a été tapé n'est jamais conservé. | Le compte visé |
| `PASSWORD_CHANGE` | Mot de passe changé depuis le profil, ou par un lien « mot de passe oublié » (`details.via`) | Le membre |
| `EMAIL_CHANGE` | Adresse e-mail changée (ancienne et nouvelle adresse dans `details`) | Le membre |
| `TWO_FACTOR_ON` / `TWO_FACTOR_OFF` | Double authentification activée / désactivée par le membre | Le membre |
| `ADMIN_PASSWORD_RESET` | Mot de passe d'un membre réinitialisé par un administrateur (`details.twoFactorDisabled` : sa double authentification a été coupée) | L'administrateur |
| `ADMIN_ROLE_CHANGE` | Droits d'administrateur donnés ou retirés | L'administrateur |
| `ADMIN_STATUS_CHANGE` | Membre désactivé ou réactivé | L'administrateur |
| `ADMIN_MEMBER_DELETE` | Compte d'un membre supprimé définitivement (`details.username` : qui c'était). Ses entrées passées restent, sous son nom | L'administrateur |
| `ADMIN_DELETION_SCHEDULE` | Suppression du compte d'un membre programmée (`details.scheduled: true`) ou annulée | L'administrateur |
| `ADMIN_MEMBER_EXPORT` | Données d'un membre exportées | L'administrateur |
| `SHARE_CREATE` / `SHARE_REVOKE` | Lien invité créé (caves, caves en écriture, collections, expiration) / révoqué | Le membre |

Les trois actions d'administration ci-dessus demandent le mot de passe de l'administrateur (et son code s'il a la double authentification) : un refus est enregistré avec le statut `error` et la raison dans `details.error`.

### 5. Rétention et purge automatique

Les entrées de journal âgées de plus de **90 jours** sont supprimées au démarrage de l'API (via `purgeOldAuditLogs`). Cette valeur n'est pas configurable depuis l'interface.

> [!CAUTION]
> Les logs d'audit sont supprimés définitivement après 90 jours. Exportez les données manuellement via l'API si vous avez besoin d'un archivage long terme.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Résolution |
| :--- | :--- |
| **La section journal d'audit n'est pas visible** | Seuls les comptes `isAdmin = true` accèdent à `/admin`. Vérifiez le rôle du compte dans la section **Gestion des utilisateurs** en haut de la même page. |
| **Redirection vers `/` à l'accès de `/admin`** | Le frontend vérifie `isAdmin` côté client. Si l'authToken est expiré, la redirection se produit. Reconnectez-vous et réessayez. |
| **Le tableau affiche un état de chargement permanent** | L'API `GET /api/admin/audit-logs` est inaccessible. Vérifiez que le service API est en cours d'exécution et que la variable `NEXT_PUBLIC_API_URL` pointe vers la bonne URL. |
| **La colonne "Utilisateur" affiche `-`** | L'utilisateur auteur de l'action a été supprimé de la base de données. L'entrée de log est conservée mais la jointure avec `User` retourne `null`. |
| **`503 DATABASE_UNAVAILABLE` en réponse API** (l'application affiche « Le serveur est momentanément indisponible ») | L'API n'atteint pas PostgreSQL : la base redémarre, est arrêtée ou n'a plus de connexion libre. Vérifiez le container de la base (`docker compose logs db`) et réessayez quand elle est revenue ; rien n'est perdu. |
| **`500 UNEXPECTED_ERROR` en réponse API** | Une erreur inattendue du serveur. La réponse n'en donne jamais le détail : consultez les logs du container API (`docker compose logs api`), où chaque erreur est écrite une fois avec sa cause, sous la forme `[error] <méthode> <chemin> -> 500 UNEXPECTED_ERROR`. |
