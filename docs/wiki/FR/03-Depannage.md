# Résolution API et base de données

**TL;DR** : Lisez les logs des conteneurs pour diagnostiquer les coupures de connexion, les échecs du scan d'étiquette ou les requêtes refusées.

**Prérequis** :
- Avoir accès aux conteneurs via `docker compose`.

**Action** :
1. Consulter les logs backend pour les erreurs d'insertion : `docker compose logs api`
2. Consulter les logs frontend pour les erreurs de rendu SSR : `docker compose logs web`
3. Vérifier la santé de la base en exécutant `docker ps` pour voir si le conteneur `db` affiche `(healthy)`.

**Le "Pare-feu" (Troubleshooting)** :

| Erreur | Résolution |
| :--- | :--- |
| La création du premier compte échoue avec « Une erreur inattendue est survenue » (ou le nom d'utilisateur est ensuite signalé comme déjà pris) | Consultez `docker compose logs api`. Si `JWT_SECRET_NOT_SET` apparaît, le secret n'est jamais arrivé dans le conteneur (anciennes versions ; les versions actuelles refusent de démarrer). Définissez `JWT_SECRET` et `CONFIG_ENCRYPTION_KEY` (voir [Installation](./01-Installation.md)), redémarrez, puis recréez le compte avec un autre nom d'utilisateur, ou supprimez la ligne à moitié créée dans la table `User`. |
| Les conteneurs API redémarrent en boucle avec une erreur de connexion | Connectez-vous manuellement via `docker compose exec db psql -U glou -d glou_db` pour vérifier que la DB est bien accessible. |
| Données non enregistrées ou interface affichant du cache | Vérifiez la console réseau de votre navigateur, ou si un scan d'étiquette est bloqué au statut `processing`. Les actions d'inventaire, de partage, de comptage et d'administration qui échouent affichent une notification d'erreur ; les modifications hors-ligne refusées par le serveur sont listées dans le panneau **Modifications en attente** (voir [Mode hors-ligne](./25-Mode-Hors-Ligne.md)). |
