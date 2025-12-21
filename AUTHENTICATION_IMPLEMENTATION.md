# Système d'Authentification Complet - Glou

## Vue d'ensemble

Le système d'authentification a été complètement implémenté avec les fonctionnalités suivantes :

## ✅ Fonctionnalités Implémentées

### 1. **Authentification Obligatoire**
- ✅ Tout le contenu du serveur est désormais protégé
- ✅ Les utilisateurs non connectés sont automatiquement redirigés vers `/login`
- ✅ Système de session basé sur des cookies sécurisés

### 2. **Page de Connexion** (`/login`)
- ✅ Interface moderne avec onglets Connexion/Inscription
- ✅ Validation côté client et serveur
- ✅ Messages d'erreur clairs
- ✅ Lien "Mot de passe oublié"

### 3. **Inscription Utilisateur**
- ✅ Formulaire d'inscription complet
- ✅ Validation stricte du mot de passe :
  - Minimum 8 caractères
  - Au moins une majuscule
  - Au moins une minuscule
  - Au moins un chiffre
- ✅ Indicateur visuel de force du mot de passe
- ✅ Vérification de correspondance des mots de passe
- ✅ Vérification d'unicité username/email
- ✅ L'inscription peut être activée/désactivée dans les paramètres

### 4. **Mot de Passe Oublié**
- ✅ Formulaire de demande de réinitialisation
- ✅ Génération de tokens sécurisés (32 bytes random)
- ✅ Tokens valides pendant 1 heure
- ✅ Envoi d'email avec lien de réinitialisation
- ✅ Protection contre l'énumération d'emails (toujours retourne succès)
- ✅ Nécessite configuration SMTP

### 5. **Réinitialisation de Mot de Passe** (`/reset-password?token=xxx`)
- ✅ Page dédiée avec validation du token
- ✅ Même validation stricte que pour l'inscription
- ✅ Indicateur de force du mot de passe
- ✅ Token marqué comme utilisé après réinitialisation
- ✅ Redirection automatique vers login après succès

### 6. **Configuration SMTP Améliorée**
- ✅ Message explicite dans le wizard de setup :
  - "Configuration du serveur d'emails sortants pour les notifications d'alertes et la fonction mot de passe oublié"
  - Avertissement : "La fonction 'mot de passe oublié' ne sera disponible que si le serveur SMTP est configuré"
- ✅ Nouveau champ `smtp_configured` dans la table `settings`
- ✅ Validation automatique de la configuration SMTP
- ✅ Désactivation des fonctionnalités email si SMTP non configuré

### 7. **Sécurité**
- ✅ Hachage des mots de passe avec bcrypt
- ✅ Tokens de réinitialisation sécurisés (crypto/rand)
- ✅ Expiration automatique des tokens (1 heure)
- ✅ Tokens à usage unique
- ✅ Cookies HttpOnly et Secure en production
- ✅ Protection contre l'énumération d'utilisateurs
- ✅ Cleanup automatique des tokens expirés

## 📁 Fichiers Créés/Modifiés

### Nouveaux Fichiers
1. **`cmd/api/auth_handlers.go`** - Handlers d'authentification
   - `handleLogin` - Connexion
   - `handleRegister` - Inscription
   - `handleForgotPassword` - Demande de réinitialisation
   - `handleResetPassword` - Réinitialisation
   - `handleCheckAuthStatus` - Vérification statut auth
   - `handleLogout` - Déconnexion

2. **`cmd/api/session.go`** - Gestion des sessions
   - `authRequiredMiddleware` - Middleware d'authentification
   - `setSession` - Création de session
   - `clearSession` - Suppression de session

3. **`assets/login.html`** - Page de connexion/inscription
4. **`assets/reset-password.html`** - Page de réinitialisation

### Fichiers Modifiés
1. **`internal/domain/admin.go`**
   - Ajout structure `PasswordResetToken`
   - Ajout champ `SMTPConfigured` dans `Settings`

2. **`internal/store/sqlite.go`**
   - Ajout table `password_reset_tokens`
   - Ajout champ `smtp_configured` dans table `settings`

3. **`internal/store/users.go`**
   - `CreatePasswordResetToken` - Créer token
   - `GetPasswordResetToken` - Récupérer token
   - `MarkPasswordResetTokenUsed` - Marquer utilisé
   - `UpdateUserPassword` - Mettre à jour mot de passe
   - `CleanupExpiredTokens` - Nettoyer tokens expirés

4. **`internal/store/settings.go`**
   - Mise à jour pour gérer `smtp_configured`

5. **`cmd/api/setup_handlers.go`**
   - Détection et marquage SMTP configuré
   - Message d'avertissement mis à jour

6. **`assets/setup.html`**
   - Message d'avertissement SMTP amélioré

7. **`cmd/api/main.go`**
   - Ajout routes d'authentification
   - Protection de toutes les routes sensibles
   - Import du package notifier

## 🔌 API Endpoints

### Routes Publiques
- `GET /login` - Page de connexion
- `GET /reset-password` - Page de réinitialisation
- `POST /api/auth/login` - Connexion
- `POST /api/auth/register` - Inscription (si activée)
- `POST /api/auth/forgot-password` - Demande réinitialisation
- `POST /api/auth/reset-password` - Réinitialisation mot de passe
- `GET /api/auth/status` - Statut authentification
- `POST /api/auth/logout` - Déconnexion

### Routes Protégées
Toutes les routes suivantes nécessitent une authentification :
- `/wines/*` - Gestion des vins
- `/caves/*` - Gestion des caves
- `/alerts/*` - Gestion des alertes
- `/api/admin/*` - Administration
- `/api/export/*` - Exports
- `/api/enrich/*` - Enrichissement
- `/` - Page d'accueil

## 🎨 Interface Utilisateur

### Page de Connexion (`/login`)
- Design moderne avec dégradé violet
- Onglets pour basculer entre Connexion et Inscription
- Validation en temps réel
- Indicateur de force du mot de passe
- Messages d'erreur clairs
- Responsive (mobile-friendly)

### Page de Réinitialisation (`/reset-password`)
- Interface cohérente avec la page de login
- Validation du token côté client
- Indicateur de force du mot de passe
- Liste des exigences du mot de passe
- Messages de succès/erreur

## 🔧 Configuration

### Paramètres Serveur
Dans `settings` table :
- `allow_registration` - Autoriser l'inscription publique (défaut: false)
- `smtp_configured` - SMTP est-il configuré? (auto-détecté)

### Variables d'Environnement SMTP
Fichier `.env.notifications` généré par le wizard :
```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=user@example.com
SMTP_PASSWORD=password
SMTP_FROM=noreply@example.com
SMTP_TO=admin@example.com
SMTP_USE_TLS=true
```

## 📊 Base de Données

### Nouvelle Table : `password_reset_tokens`
```sql
CREATE TABLE password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Modifications Table `settings`
- Ajout colonne `smtp_configured INTEGER DEFAULT 0`

## 🔐 Sécurité ANSSI

Le système respecte les recommandations ANSSI :
- ✅ Hachage bcrypt (cost factor 10)
- ✅ Tokens cryptographiquement sécurisés (crypto/rand)
- ✅ Expiration des tokens
- ✅ Cookies HttpOnly et Secure
- ✅ Protection contre le brute force (rate limiting existant)
- ✅ Validation stricte des mots de passe
- ✅ Pas de divulgation d'information (énumération)

## 🚀 Utilisation

### Premier Démarrage
1. Compléter le wizard de setup (`/setup`)
2. Configurer SMTP si désiré (pour mot de passe oublié)
3. Créer le premier utilisateur admin
4. Se connecter via `/login`

### Gestion des Utilisateurs
- **Admin** : Créé lors du setup
- **Utilisateurs** : S'inscrivent via `/login` (si inscription activée)
- **Rôles** : `admin` ou `user`

### Réinitialisation de Mot de Passe
1. Utilisateur clique sur "Mot de passe oublié"
2. Entre son email
3. Reçoit un email avec lien (valide 1h)
4. Clique sur le lien → `/reset-password?token=xxx`
5. Entre nouveau mot de passe
6. Redirigé vers `/login`

## ⚠️ Limitations Actuelles

### À Améliorer (TODO)
1. **Sessions** : Actuellement basées sur cookies simples
   - → Migrer vers JWT ou système de session robuste
   
2. **Envoi d'Emails** : Utilise le notifier SMTP existant
   - → Améliorer pour supporter destinataires dynamiques
   
3. **Rôles** : Distinction admin/user pas encore exploitée
   - → Ajouter middleware de vérification de rôle
   
4. **Rate Limiting** : Existant mais pas spécifique à auth
   - → Ajouter rate limiting dédié pour login/register

5. **Two-Factor Auth** : Pas implémenté
   - → Envisager pour le futur

6. **Historique Connexions** : Pas de tracking
   - → Ajouter logs de connexions

## 📝 Prochaines Étapes Suggérées

1. Tester le système complet :
   - Inscription
   - Connexion
   - Mot de passe oublié (avec SMTP configuré)
   - Réinitialisation
   - Protection des routes

2. Configurer SMTP en production pour activer mot de passe oublié

3. Décider si l'inscription publique doit être activée

4. Migrer vers un système de session plus robuste (JWT)

5. Ajouter middleware de vérification de rôle (admin vs user)

6. Implémenter l'approbation des inscriptions si `require_approval = true`

## 🎉 Résultat

Le serveur Glou dispose désormais d'un système d'authentification complet et sécurisé :
- ✅ Contenu protégé par authentification
- ✅ Inscription utilisateur avec validation stricte
- ✅ Mot de passe oublié avec email
- ✅ Configuration SMTP documentée
- ✅ Interface utilisateur moderne
- ✅ Sécurité renforcée
