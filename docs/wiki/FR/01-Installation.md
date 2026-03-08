# Déployer la Stack Glou

**TL;DR** : Utilisez Docker Compose pour monter l'ensemble de la stack isolée. Aucune installation manuelle de dépendances n'est requise.

**Prérequis** :
- Docker et Docker Compose installés et en cours d'exécution.

**Action** :
1. Copier le fichier de configuration d'environnement : `cp .env.example .env`
2. Démarrer la stack isolée en arrière-plan : `docker-compose up -d`
3. Accéder à l'interface web sur `http://localhost:3000`.

**Le "Pare-feu" (Troubleshooting)** :

| Erreur | Résolution |
| :--- | :--- |
| `port is already allocated` | Un autre service utilise le port 3000 (web), 3001 (api) ou 5432 (db). Arrêtez le service conflictuel ou modifiez les ports dans `.env`. |
| `database "glou_db" does not exist` | Le conteneur `db` n'a pas terminé son initialisation. Patientez 10 secondes et réessayez. |
