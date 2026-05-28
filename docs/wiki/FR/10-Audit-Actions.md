# Consulter le Journal d'Audit des Actions

## TL;DR
Accédez à `/admin`, section **Journal d'audit**, pour voir la liste paginée de toutes les actions effectuées sur l'instance : qui, quoi, statut, IP et horodatage. Réservé aux administrateurs.

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
| **Utilisateur** | Nom d'utilisateur (`username`) de l'auteur. Affiche `—` si l'utilisateur a été supprimé. |
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
| `CREATE` | Création d'un actif (bouteille, etc.) |
| `READ` | Lecture d'un actif |
| `LIST` | Listage d'actifs |
| `UPDATE` | Modification d'un actif |
| `DELETE` | Suppression d'un actif |
| `RESTORE` | Restauration d'un actif archivé |
| `CELLAR_CREATE` | Création d'une cave |
| `CELLAR_READ` | Lecture d'une cave |
| `CELLAR_UPDATE` | Modification d'une cave |
| `CELLAR_DELETE` | Suppression d'une cave |
| `COLLECTION_CREATE` | Création d'une collection |
| `COLLECTION_UPDATE` | Modification d'une collection |
| `COLLECTION_DELETE` | Suppression d'une collection |

### 5. Rétention et purge automatique

Les entrées de journal âgées de plus de **90 jours** sont supprimées automatiquement au démarrage de l'API (via `purgeOldAuditLogs`). Cette valeur n'est pas configurable depuis l'interface.

> [!CAUTION]
> Les logs d'audit sont supprimés définitivement après 90 jours. Exportez les données manuellement via l'API si vous avez besoin d'un archivage long terme.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Résolution |
| :--- | :--- |
| **La section journal d'audit n'est pas visible** | Seuls les comptes `isAdmin = true` accèdent à `/admin`. Vérifiez le rôle du compte dans la section **Gestion des utilisateurs** en haut de la même page. |
| **Redirection vers `/` à l'accès de `/admin`** | Le frontend vérifie `isAdmin` côté client. Si l'authToken est expiré, la redirection se produit. Reconnectez-vous et réessayez. |
| **Le tableau affiche un état de chargement permanent** | L'API `GET /api/admin/audit-logs` est inaccessible. Vérifiez que le service API est en cours d'exécution et que la variable `NEXT_PUBLIC_API_URL` pointe vers la bonne URL. |
| **Colonne "Utilisateur" affiche `—`** | L'utilisateur auteur de l'action a été supprimé de la base de données. L'entrée de log est conservée mais la jointure avec `User` retourne `null`. |
| **`INTERNAL_SERVER_ERROR` en réponse API** | Consultez les logs du container API (`docker logs glou-api`). La cause la plus fréquente est une perte de connexion à la base de données PostgreSQL. |
