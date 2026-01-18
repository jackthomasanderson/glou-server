# Démarrage Rapide

## TL;DR
Lancer avec Docker. Accès sur `http://localhost:3000`.

## Prérequis
- Docker & Docker Compose installés.

## Action
1. Créer le fichier `.env` (copier depuis le README).
2. Démarrer la base de données :
   ```bash
   docker compose up -d db
   ```
3. Démarrer les services :
   ```bash
   docker compose up -d
   ```
4. Accéder :
   - Web : `http://localhost:3000`
   - API : `http://localhost:3001/api`

## Dépannage
| Erreur | Vérification |
|--------|--------------|
| `Connection refused` | Docker tourne-t-il ? Ports 3000/3001 libres ? |
| `DB connection failed` | Vérifier `DB_HOST`, `DB_USER`, `DB_PASSWORD` dans `.env`. |
