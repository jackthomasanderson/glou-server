# Résolution API et Base de Données

**TL;DR** : Lisez les logs des conteneurs pour diagnostiquer les coupures de connexion locale ou les limites de l'API OCR/Vivino.

**Prérequis** :
- Avoir accès aux conteneurs via `docker-compose`.

**Action** :
1. Consulter les logs backend pour les erreurs d'insertion : `docker logs glou-api-1`
2. Consulter les logs frontend pour les erreurs de rendu SSR : `docker logs glou-web-1`
3. Vérifier la santé de la base en exécutant `docker ps` pour voir si le conteneur `db` affiche `(healthy)`.

**Le "Pare-feu" (Troubleshooting)** :

| Erreur | Résolution |
| :--- | :--- |
| La création du premier compte échoue avec « Une erreur inattendue est survenue » (ou le nom d'utilisateur est ensuite signalé comme déjà pris) | Consultez `docker logs glou-api-1`. Si `JWT_SECRET_NOT_SET` apparaît, le secret n'est jamais arrivé dans le conteneur (anciennes versions ; les versions actuelles refusent de démarrer). Définissez `JWT_SECRET` et `CONFIG_ENCRYPTION_KEY` (voir [Installation](./01-Installation.md)), redémarrez, puis recréez le compte avec un autre nom d'utilisateur, ou supprimez la ligne à moitié créée dans la table `User`. |
| Les conteneurs API redémarrent en boucle avec erreur connexion | Connectez-vous manuellement via `docker exec -it glou-db-1 psql -U glou -d glou_db` pour valider si la DB accepte les connexions entrantes avec les bons identifiants. |
| Données modifiées en boucle ou interface affichant du cache | Vérifiez la console réseau de votre navigateur ou observez si une tâche asynchrone (OCR) est bloquée au statut `processing`. |
