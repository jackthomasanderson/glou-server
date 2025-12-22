# 🔐 Sécurité & Chiffrement - Glou Server

Ce document regroupe les mesures de sécurité et les procédures de chiffrement implémentées dans Glou Server, conformément aux recommandations de l'ANSSI.

## 🛡️ Architecture de Sécurité

Glou Server utilise un système de chiffrement **AES-256-GCM** pour protéger toutes les données sensibles au repos.

### Spécifications Techniques
- **Algorithme** : AES-256-GCM (Confidentialité + Authenticité)
- **Taille de clé** : 256 bits
- **Dérivation** : PBKDF2 avec 100 000 itérations (SHA-256)
- **Nonce** : Aléatoire unique (96 bits) par opération

## ⚙️ Configuration (Production)

Pour activer le chiffrement en production, configurez les variables d'environnement suivantes :

```bash
# Générer une passphrase (min 32 chars)
ENCRYPTION_PASSPHRASE=$(openssl rand -base64 48)
# Générer un salt unique
ENCRYPTION_SALT=$(openssl rand -hex 16)
ENVIRONMENT=production
```

## 📋 Checklist de Déploiement

### 1. Fichiers & Permissions
- [ ] `.env` en `chmod 600`
- [ ] `glou.db` en `chmod 600`
- [ ] Exécution sous un utilisateur dédié (non-root)

### 2. Réseau
- [ ] HTTPS activé via reverse proxy (Nginx/Caddy)
- [ ] `PUBLIC_PROTOCOL=https` et `PUBLIC_DOMAIN` configurés
- [ ] CORS limité aux domaines autorisés

### 3. Mots de Passe
- [ ] Mot de passe admin fort (≥ 12 caractères)
- [ ] Credentials SMTP/API stockés via le système de chiffrement

## 🛠️ Utilisation (Développeurs)

### Stocker une donnée chiffrée
```go
err := store.StoreEncryptedCredential(ctx, "service_name", "type", "secret_value")
```

### Récupérer une donnée déchiffrée
```go
value, err := store.GetDecryptedCredential(ctx, "service_name")
```

## 🔄 Mises à jour & Migration
Le système de chiffrement a été introduit en v1.0.0. Pour les installations existantes, les credentials SMTP et tokens API doivent être ré-enregistrés via l'interface ou le wizard de setup pour être chiffrés.
