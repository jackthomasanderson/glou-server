# 🛠️ Guide de Développement & Tests

## 🔐 Système d'Authentification

Le système d'authentification protège l'ensemble du serveur.

### Fonctionnalités
- **Sessions** : Basées sur des cookies sécurisés.
- **Inscription** : Validation stricte des mots de passe (8+ chars, Maj, Min, Chiffre).
- **Réinitialisation** : Système de tokens sécurisés par email (nécessite SMTP).

## QA

Procédures de test locales et scripts de test ont été supprimés du dépôt principal. Utilisez l'intégration continue (CI) ou des environnements de staging pour exécuter des suites de test et des scénarios manuels.
## 🏗️ Architecture Frontend
Le frontend est une application React servie par le binaire Go.
- **Build** : `npm run build` dans le dossier `web/`.
- **Dev** : `npm run dev` avec proxy vers le backend Go (port 8080).
