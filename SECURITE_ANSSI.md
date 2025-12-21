# Guide de Sécurité ANSSI - Glou Server

## Vue d'ensemble

Ce document décrit les mesures de sécurité implémentées dans Glou Server conformément aux recommandations de l'ANSSI (Agence Nationale de la Sécurité des Systèmes d'Information).

## 1. Chiffrement des Données (Recommandations ANSSI)

### 1.1 Algorithme de Chiffrement

**AES-256-GCM (Galois/Counter Mode)**

- **Taille de clé** : 256 bits (recommandation ANSSI pour données sensibles)
- **Mode** : GCM pour assurer à la fois la confidentialité et l'authenticité
- **Nonce** : Généré aléatoirement pour chaque opération de chiffrement (96 bits)
- **Tag d'authentification** : Vérifié lors du déchiffrement

### 1.2 Dérivation de Clé

**PBKDF2 (Password-Based Key Derivation Function 2)**

- **Fonction de hachage** : SHA-256
- **Nombre d'itérations** : 100 000 minimum (recommandation ANSSI 2024)
- **Salt** : Unique et configurable via `ENCRYPTION_SALT`
- **Longueur de clé dérivée** : 256 bits

### 1.3 Configuration du Chiffrement

```bash
# Variables d'environnement requises
export ENCRYPTION_PASSPHRASE="votre_phrase_de_passe_tres_longue_minimum_32_caracteres"
export ENCRYPTION_SALT="salt_unique_pour_votre_installation"
export ENVIRONMENT="production"
```

**Exigences de sécurité** :
- Phrase de passe : minimum 32 caractères
- Salt : unique par installation
- Obligatoire en environnement de production

### 1.4 Génération Sécurisée de Clés

Le système utilise `crypto/rand` (générateur cryptographiquement sécurisé) :

```go
// Génération d'une clé de 256 bits
key := make([]byte, 32)
rand.Read(key)
```

## 2. Données Chiffrées

### 2.1 Données Sensibles Chiffrées en Base de Données

Les données suivantes sont **automatiquement chiffrées** avant stockage :

1. **Credentials SMTP**
   - Mot de passe SMTP
   - Username SMTP
   
2. **Tokens d'authentification**
   - Token Gotify
   - Tokens API tiers

3. **Données utilisateur sensibles**
   - Adresses email (selon configuration)
   - Informations de contact privées

### 2.2 Table `encrypted_credentials`

Structure :
```sql
CREATE TABLE encrypted_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL UNIQUE,
    credential_type TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,  -- Chiffré avec AES-256-GCM
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```

## 3. Hachage de Mots de Passe

### 3.1 Algorithme

**bcrypt** (coût par défaut = 10)

- Résistant aux attaques par force brute
- Salt automatiquement généré et intégré
- Coût adaptatif (peut être augmenté avec le temps)

### 3.2 Stockage

Les mots de passe ne sont **jamais** stockés en clair :
- Hachage via `bcrypt.GenerateFromPassword`
- Vérification via `bcrypt.CompareHashAndPassword`
- Pas de mécanisme de récupération (reset uniquement)

## 4. Protection des Communications

### 4.1 HTTPS Recommandé

En production, **toujours utiliser HTTPS** :

```bash
# Configuration reverse proxy (nginx, caddy, etc.)
proxy_mode=true
proxy_headers=true
public_protocol=https
public_domain=votre-domaine.com
```

### 4.2 Headers de Sécurité

Implémentés automatiquement :
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy` (configurable)

### 4.3 CORS

Configuration stricte des origines autorisées :
```bash
export CORS_ALLOWED_ORIGINS="https://votre-domaine.com,https://app.votre-domaine.com"
```

## 5. Authentification et Autorisation

### 5.1 Gestion des Sessions

- Session timeout configurable (défaut : 1440 minutes)
- Invalidation automatique après expiration
- Pas de sessions persistantes côté client

### 5.2 Rôles et Permissions

- **admin** : accès complet
- **user** : accès lecture/écriture limité
- Vérification systématique avant chaque opération

### 5.3 Protection contre les Attaques

#### Rate Limiting
```go
// Limite configurable par IP
RateLimitRequests: 100 requêtes
RateLimitWindow: 60 secondes
```

#### Protection CSRF
- Vérification de l'origine des requêtes
- Tokens CSRF pour opérations sensibles

## 6. Audit et Journalisation

### 6.1 Activity Log

Toutes les actions importantes sont journalisées :
```sql
CREATE TABLE activity_log (
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME NOT NULL
);
```

### 6.2 Données Journalisées

- Création/modification/suppression d'entités
- Tentatives de connexion
- Accès aux données sensibles
- Erreurs de sécurité

### 6.3 Rotation des Logs

Recommandation : rotation automatique des logs
```bash
# Exemple avec logrotate
/var/log/glou-server/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 glou-server glou-server
}
```

## 7. Sécurité de la Base de Données

### 7.1 SQLite Sécurisé

- Permissions fichier : `0600` (lecture/écriture propriétaire uniquement)
- Chemin absolu hors webroot
- Pas d'accès direct via HTTP

### 7.2 Protection contre les Injections SQL

- Utilisation systématique de requêtes paramétrées
- Pas de concaténation de chaînes SQL
- Validation stricte des entrées

### 7.3 Sauvegarde Chiffrée

Recommandation pour les backups :
```bash
# Backup chiffré avec GPG
sqlite3 glou.db ".backup glou-backup.db"
gpg --symmetric --cipher-algo AES256 glou-backup.db
```

## 8. Gestion des Secrets

### 8.1 Variables d'Environnement

**NE JAMAIS** commiter les secrets dans le code :
- Utiliser des variables d'environnement
- Fichiers `.env` dans `.gitignore`
- Gestionnaires de secrets (Vault, AWS Secrets Manager)

### 8.2 Rotation des Clés

Recommandation ANSSI : rotation régulière

```bash
# Générer une nouvelle passphrase
openssl rand -base64 48

# Mettre à jour et redémarrer
export ENCRYPTION_PASSPHRASE="nouvelle_passphrase"
systemctl restart glou-server
```

### 8.3 Stockage Sécurisé

Options recommandées :
1. **Gestionnaire de secrets cloud** (AWS, Azure, GCP)
2. **HashiCorp Vault**
3. **Fichier chiffré** avec permissions restrictives

## 9. Hardening du Système

### 9.1 Permissions Fichiers

```bash
# Binaire
chmod 750 /usr/local/bin/glou-server

# Base de données
chmod 600 /var/lib/glou-server/glou.db

# Fichiers de configuration
chmod 600 /etc/glou-server/.env
```

### 9.2 Utilisateur Dédié

```bash
# Créer un utilisateur système
useradd -r -s /bin/false -d /var/lib/glou-server glou-server

# Exécuter le service sous cet utilisateur
User=glou-server
Group=glou-server
```

### 9.3 Isolation

- Utiliser des conteneurs (Docker) ou VMs
- Réseau isolé si possible
- Firewall configuré (ports minimaux)

## 10. Conformité RGPD

### 10.1 Données Personnelles

Données collectées :
- Nom d'utilisateur
- Adresse email (chiffrée si activé)
- Adresse IP (logs)

### 10.2 Droits des Utilisateurs

Implémentation requise :
- [ ] Droit à l'accès (export des données)
- [ ] Droit à la rectification
- [ ] Droit à l'effacement
- [ ] Droit à la portabilité

### 10.3 Conservation des Données

- Logs : 30 jours maximum recommandé
- Données utilisateur : tant que compte actif
- Suppression complète sur demande

## 11. Checklist de Déploiement Sécurisé

### Avant le Déploiement

- [ ] Générer une passphrase de chiffrement forte (≥32 caractères)
- [ ] Configurer un salt unique
- [ ] Activer HTTPS avec certificat valide
- [ ] Configurer le firewall
- [ ] Créer un utilisateur système dédié
- [ ] Définir des permissions fichiers strictes
- [ ] Configurer la rotation des logs
- [ ] Tester la sauvegarde et restauration

### Configuration Production

```bash
# .env de production
ENVIRONMENT=production
ENCRYPTION_PASSPHRASE=<phrase-forte-32-caracteres-minimum>
ENCRYPTION_SALT=<salt-unique-installation>
DB_PATH=/var/lib/glou-server/glou.db
PORT=8080
CORS_ALLOWED_ORIGINS=https://votre-domaine.com
LOG_LEVEL=info
RATE_LIMIT_REQUESTS=50
RATE_LIMIT_WINDOW_SECONDS=60
SESSION_TIMEOUT=720
```

### Après le Déploiement

- [ ] Vérifier que le chiffrement est actif
- [ ] Tester l'accès HTTPS
- [ ] Vérifier les logs d'erreur
- [ ] Tester le rate limiting
- [ ] Effectuer un audit de sécurité
- [ ] Documenter la configuration

## 12. Monitoring et Alertes

### 12.1 Événements à Surveiller

- Tentatives de connexion échouées répétées
- Accès non autorisés
- Erreurs de déchiffrement
- Dépassement du rate limit
- Erreurs de base de données

### 12.2 Outils Recommandés

- **Prometheus** + **Grafana** : métriques
- **ELK Stack** : logs centralisés
- **Fail2ban** : protection contre brute force

## 13. Réponse aux Incidents

### 13.1 Procédure

1. **Détection** : via logs et monitoring
2. **Isolation** : couper l'accès si nécessaire
3. **Analyse** : examiner les logs
4. **Correction** : appliquer le patch
5. **Documentation** : rapport d'incident

### 13.2 Contacts

- CERT-FR : https://www.cert.ssi.gouv.fr/
- Cybermalveillance : https://www.cybermalveillance.gouv.fr/

## 14. Mises à Jour et Maintenance

### 14.1 Fréquence

- **Critiques** : immédiatement
- **Sécurité** : dans les 7 jours
- **Features** : mensuellement

### 14.2 Procédure de Mise à Jour

```bash
# 1. Backup
sqlite3 glou.db ".backup glou-backup-$(date +%Y%m%d).db"

# 2. Arrêter le service
systemctl stop glou-server

# 3. Mettre à jour le binaire
cp glou-server-new /usr/local/bin/glou-server

# 4. Redémarrer
systemctl start glou-server

# 5. Vérifier
systemctl status glou-server
tail -f /var/log/glou-server/app.log
```

## 15. Références ANSSI

- **Guide de sécurité des applications web** : https://www.ssi.gouv.fr/
- **Référentiel général de sécurité (RGS)**
- **Recommandations pour la sécurisation des sites web**
- **Guide d'hygiène informatique**
- **Recommandations de sécurité relatives à TLS**

## 16. Support et Contact

Pour toute question de sécurité :
- Email : security@votre-domaine.com
- Signalement de vulnérabilité : PGP recommandé

---

**Dernière mise à jour** : 21 décembre 2024  
**Version** : 1.0  
**Conformité** : Recommandations ANSSI 2024
