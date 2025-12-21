# Guide de Test - Système d'Authentification Glou

## 🎯 Objectif
Tester le nouveau système d'authentification complet avec inscription, connexion, et mot de passe oublié.

## 📋 Prérequis

### 1. Réinitialiser la Base de Données (Optionnel)
Si vous voulez repartir de zéro :
```powershell
cd 'c:\Users\Romain\Documents\_dev\glou-server\glou-server'
Remove-Item -Path glou.db -Force -ErrorAction SilentlyContinue
```

### 2. Démarrer le Serveur
```powershell
cd 'c:\Users\Romain\Documents\_dev\glou-server\glou-server'
.\api.exe
```

Le serveur démarre sur `http://localhost:8080`

## 🧪 Scénarios de Test

### Scénario 1 : Configuration Initiale

#### 1.1 Premier démarrage
1. Ouvrir http://localhost:8080
2. ✅ Vous êtes redirigé vers `/setup` (wizard de configuration)
3. Compléter le wizard :
   - **Étape 1** : Créer admin
     - Username : `admin`
     - Email : `admin@glou.local`
     - Password : `Admin123!`
   - **Étape 2** : Personnalisation (optionnel)
     - Titre : `Ma Cave`
     - Slogan : `Gestion de Collection`
   - **Étape 3** : Réseau (optionnel)
     - Domain : `localhost:8080`
     - Protocol : `http`
   - **Étape 4** : Notifications - SMTP
     - ⚠️ **IMPORTANT** : Si vous voulez tester "Mot de passe oublié", configurez SMTP
     - Sinon, passez cette étape
   - **Étape 5** : Résumé et finalisation

#### 1.2 Vérifier la redirection
1. Après setup, vous êtes redirigé vers `/`
2. ✅ Vous devriez être automatiquement redirigé vers `/login` (pas connecté)

---

### Scénario 2 : Connexion Administrateur

#### 2.1 Page de connexion
1. Sur `/login`, vérifier :
   - ✅ Deux onglets : "Connexion" et "Inscription"
   - ✅ Onglet "Connexion" actif par défaut
   - ✅ Lien "Mot de passe oublié ?"

#### 2.2 Se connecter
1. Entrer les identifiants admin :
   - Username : `admin`
   - Password : `Admin123!`
2. Cliquer sur "Se connecter"
3. ✅ Message de succès
4. ✅ Redirection vers `/` (page principale)
5. ✅ Accès à l'application Glou

#### 2.3 Vérifier l'accès
1. Naviguer dans l'application
2. ✅ Toutes les fonctionnalités accessibles
3. Ouvrir `/admin`
4. ✅ Dashboard admin accessible

---

### Scénario 3 : Inscription Nouvel Utilisateur

#### 3.1 Activer l'inscription (si nécessaire)
1. En tant qu'admin, aller sur `/admin`
2. Section "Paramètres"
3. Activer "Autoriser l'inscription" (`allow_registration`)
4. Sauvegarder

#### 3.2 Se déconnecter
1. ⚠️ **TODO** : Ajouter bouton déconnexion dans l'interface
2. Pour l'instant, supprimer le cookie `glou_session` manuellement (DevTools)
3. Ou ouvrir fenêtre navigation privée

#### 3.3 Tenter l'inscription
1. Aller sur `/login`
2. Cliquer sur l'onglet "Inscription"
3. Vérifier les messages :
   - ✅ Si SMTP non configuré : Avertissement jaune
   - ✅ Si inscription désactivée : Onglet masqué

#### 3.4 S'inscrire
1. Remplir le formulaire :
   - Username : `testuser`
   - Email : `test@glou.local`
   - Password : `Test123!`
   - Confirmer : `Test123!`
2. Observer l'indicateur de force du mot de passe :
   - ✅ Barre colorée (rouge/orange/vert)
   - ✅ Texte "Faible"/"Moyen"/"Fort"
3. Cliquer sur "S'inscrire"
4. ✅ Message de succès
5. ✅ Redirection vers onglet "Connexion"
6. ✅ Username pré-rempli

#### 3.5 Se connecter avec nouveau compte
1. Entrer le mot de passe : `Test123!`
2. Cliquer sur "Se connecter"
3. ✅ Accès à l'application

---

### Scénario 4 : Mot de Passe Oublié

⚠️ **Prérequis** : SMTP doit être configuré pour tester ce scénario

#### 4.1 Demander une réinitialisation
1. Sur `/login`, cliquer sur "Mot de passe oublié ?"
2. ✅ Redirection vers formulaire dédié
3. Entrer un email : `admin@glou.local`
4. Cliquer sur "Envoyer le lien"
5. ✅ Message : "Si cet email existe, un lien de réinitialisation a été envoyé"

#### 4.2 Vérifier l'email
1. Ouvrir la boîte email configurée
2. ✅ Email reçu avec sujet "[Glou] Réinitialisation de votre mot de passe"
3. ✅ Lien de réinitialisation présent
4. Copier le lien (format : `http://localhost:8080/reset-password?token=...`)

#### 4.3 Réinitialiser le mot de passe
1. Ouvrir le lien
2. ✅ Page de réinitialisation affichée
3. ✅ Token validé (pas de message d'erreur)
4. Entrer nouveau mot de passe : `NewAdmin123!`
5. Confirmer : `NewAdmin123!`
6. Observer l'indicateur de force
7. Cliquer sur "Réinitialiser le mot de passe"
8. ✅ Message de succès
9. ✅ Redirection vers `/login` après 2 secondes

#### 4.4 Se connecter avec nouveau mot de passe
1. Username : `admin`
2. Password : `NewAdmin123!`
3. Cliquer sur "Se connecter"
4. ✅ Connexion réussie

#### 4.5 Tester token expiré/utilisé
1. Essayer de réutiliser le même lien
2. ✅ Message d'erreur : "Lien de réinitialisation invalide ou expiré"
3. ✅ Formulaire masqué

---

### Scénario 5 : Protection des Routes

#### 5.1 Accès sans authentification
1. Se déconnecter (supprimer cookie)
2. Essayer d'accéder à :
   - `/` ✅ Redirige vers `/login`
   - `/admin` ✅ Redirige vers `/login`
   - `/wines` ✅ Retourne erreur 401 ou redirige
   - `/api/admin/settings` ✅ Retourne erreur 401

#### 5.2 Accès avec authentification
1. Se connecter
2. Accéder à :
   - `/` ✅ Page principale accessible
   - `/admin` ✅ Dashboard accessible
   - API endpoints ✅ Fonctionnels

---

### Scénario 6 : Validation des Mots de Passe

#### 6.1 Mots de passe faibles (doivent échouer)
Tester à l'inscription ou réinitialisation :
- `12345678` ❌ Pas de majuscule
- `password` ❌ Trop court, pas de majuscule, pas de chiffre
- `Password` ❌ Pas de chiffre
- `Password1` ⚠️ Acceptable mais faible
- `Pass123` ❌ Trop court

#### 6.2 Mots de passe forts (doivent réussir)
- `Admin123!` ✅
- `SecurePass1` ✅
- `MyP@ssw0rd` ✅
- `C0mpl3xP@ss` ✅

---

## 🔍 Points de Vérification

### Sécurité
- [ ] Mots de passe hashés dans la base (pas en clair)
- [ ] Cookies HttpOnly (visible dans DevTools)
- [ ] Tokens de réinitialisation uniques
- [ ] Tokens expirent après 1 heure
- [ ] Tokens à usage unique (ne peuvent être réutilisés)
- [ ] Protection contre énumération d'emails (toujours même message)

### UX/UI
- [ ] Design cohérent et moderne
- [ ] Responsive (mobile-friendly)
- [ ] Messages d'erreur clairs
- [ ] Indicateurs de force du mot de passe
- [ ] Transitions fluides entre écrans
- [ ] Validation en temps réel

### Fonctionnel
- [ ] Inscription fonctionne (si activée)
- [ ] Connexion fonctionne
- [ ] Déconnexion fonctionne (TODO: ajouter bouton)
- [ ] Mot de passe oublié fonctionne (si SMTP configuré)
- [ ] Réinitialisation fonctionne
- [ ] Protection des routes fonctionne
- [ ] Redirection après login fonctionne

---

## 🐛 Problèmes Connus

1. **Bouton Déconnexion** : Pas encore ajouté dans l'interface principale
   - Workaround : Supprimer cookie manuellement
   - TODO : Ajouter dans navbar

2. **Sessions Simplifiées** : Cookies simples, pas JWT
   - Fonctionne mais pas optimal
   - TODO : Migrer vers JWT

3. **Email Destinataire Dynamique** : L'email de réinitialisation utilise le destinataire SMTP configuré
   - TODO : Améliorer le système de notification

---

## 📊 Vérification Base de Données

### Consulter les utilisateurs
```sql
SELECT * FROM users;
```

### Consulter les tokens de réinitialisation
```sql
SELECT * FROM password_reset_tokens;
```

### Consulter les paramètres
```sql
SELECT allow_registration, smtp_configured FROM settings;
```

---

## ✅ Checklist de Test Complète

- [ ] Setup wizard fonctionne
- [ ] Redirection vers login si non authentifié
- [ ] Connexion admin fonctionne
- [ ] Accès à l'application après login
- [ ] Inscription fonctionne (si activée)
- [ ] Validation mot de passe stricte
- [ ] Indicateur force mot de passe
- [ ] "Mot de passe oublié" accessible
- [ ] Email de réinitialisation reçu (si SMTP)
- [ ] Lien de réinitialisation fonctionne
- [ ] Token expire après utilisation
- [ ] Nouveau mot de passe fonctionne
- [ ] Routes protégées redirigent si non authentifié
- [ ] Routes accessibles si authentifié
- [ ] Configuration SMTP détectée correctement
- [ ] Message d'avertissement SMTP dans setup

---

## 🎉 Résultat Attendu

Après tous ces tests, vous devriez avoir :
- ✅ Un système d'authentification complet
- ✅ Protection totale du contenu
- ✅ Inscription sécurisée
- ✅ Mot de passe oublié fonctionnel
- ✅ Interface utilisateur moderne
- ✅ Sécurité renforcée

---

## 📝 Notes pour le Développement

### Améliorations Futures
1. Ajouter bouton déconnexion dans la navbar
2. Migrer vers JWT pour les sessions
3. Ajouter 2FA (Two-Factor Authentication)
4. Historique des connexions
5. Notification de connexion par email
6. Gestion des rôles (admin vs user)
7. Approbation des inscriptions (`require_approval`)

### Configuration Production
- Activer HTTPS
- Configurer SMTP avec serveur réel
- Définir `Environment=production` pour cookies Secure
- Activer rate limiting strict
- Configurer backup de la base de données
