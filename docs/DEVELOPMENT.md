# 🛠️ Guide de Développement & Tests

## 🔐 Système d'Authentification

Le système d'authentification protège l'ensemble du serveur.

### Fonctionnalités
- **Sessions** : Basées sur des cookies sécurisés.
- **Inscription** : Validation stricte des mots de passe (8+ chars, Maj, Min, Chiffre).
- **Réinitialisation** : Système de tokens sécurisés par email (nécessite SMTP).

## 🧪 Procédures de Test

### 1. Réinitialisation complète
```powershell
Remove-Item -Path glou.db -Force -ErrorAction SilentlyContinue
.\api.exe
```

### 2. Scénarios de Test
- **Setup Wizard** : Accès automatique à `/setup` sur une base vide.
- **Login/Logout** : Vérification des redirections vers `/login`.
- **Mot de passe oublié** : Test de l'envoi d'email et de la réinitialisation via token.

## 🏗️ Architecture Frontend
Le frontend est une application React servie par le binaire Go.
- **Build** : `npm run build` dans le dossier `web/`.
- **Dev** : `npm run dev` avec proxy vers le backend Go (port 8080).
