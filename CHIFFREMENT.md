# Chiffrement des Données - Guide Rapide

## Vue d'ensemble

Glou Server implémente un système de chiffrement conforme aux recommandations de l'ANSSI (Agence Nationale de la Sécurité des Systèmes d'Information) pour protéger les données sensibles stockées en base de données.

## Technologie Utilisée

- **Algorithme** : AES-256-GCM (Advanced Encryption Standard, mode Galois/Counter)
- **Taille de clé** : 256 bits
- **Dérivation** : PBKDF2 avec 100 000 itérations
- **Fonction de hachage** : SHA-256
- **Nonce** : Aléatoire unique par opération

## Configuration Rapide

### 1. Générer une Passphrase Sécurisée

```bash
# Générer une passphrase de 48 caractères
openssl rand -base64 48
```

### 2. Configurer les Variables d'Environnement

```bash
# Dans votre fichier .env
ENCRYPTION_PASSPHRASE=<votre_passphrase_generee_48_caracteres>
ENCRYPTION_SALT=glou-server-salt-unique-$(openssl rand -hex 16)
ENVIRONMENT=production
```

**Important** : La passphrase doit faire au minimum 32 caractères.

### 3. Vérifier l'Activation

Au démarrage, vous devriez voir :
```
Encryption service initialized (ANSSI AES-256-GCM)
```

## Données Automatiquement Chiffrées

Les données suivantes sont **automatiquement chiffrées** avant stockage :

1. **Credentials de notification**
   - Mots de passe SMTP
   - Tokens Gotify
   - Autres tokens API

2. **Informations sensibles**
   - Stockées via la table `encrypted_credentials`
   - Chiffrées/déchiffrées de manière transparente

## Utilisation dans le Code

### Stocker une Credential Chiffrée

```go
ctx := context.Background()

// Stocke automatiquement la valeur chiffrée
err := store.StoreEncryptedCredential(ctx, "smtp_password", "password", "mon_mot_de_passe_secret")
if err != nil {
    log.Fatal(err)
}
```

### Récupérer une Credential Déchiffrée

```go
// Récupère et déchiffre automatiquement
password, err := store.GetDecryptedCredential(ctx, "smtp_password")
if err != nil {
    log.Fatal(err)
}
```

### Supprimer une Credential

```go
err := store.DeleteEncryptedCredential(ctx, "smtp_password")
```

## Migration de Données Existantes

Si vous avez déjà des données en clair, voici comment les migrer :

```go
// Script de migration (à adapter)
func migrateToEncrypted(store *store.Store) error {
    ctx := context.Background()
    
    // Récupérer les anciennes données
    oldPassword := getOldPassword() // votre logique
    
    // Stocker chiffré
    return store.StoreEncryptedCredential(ctx, "smtp_password", "password", oldPassword)
}
```

## Sécurité en Production

### Checklist Obligatoire

- [ ] Passphrase ≥ 32 caractères
- [ ] Salt unique par installation
- [ ] `ENVIRONMENT=production` configuré
- [ ] Fichier `.env` avec permissions `600`
- [ ] Passphrase stockée dans un gestionnaire de secrets

### Bonnes Pratiques

1. **Ne jamais commiter les secrets**
   ```bash
   # Ajoutez à .gitignore
   .env
   *.key
   ```

2. **Utiliser un gestionnaire de secrets**
   - HashiCorp Vault
   - AWS Secrets Manager
   - Azure Key Vault
   - Google Secret Manager

3. **Rotation régulière**
   - Changez la passphrase tous les 6-12 mois
   - Rechiffrez les données avec la nouvelle clé

4. **Sauvegarde sécurisée**
   ```bash
   # Backup chiffré de la base de données
   sqlite3 glou.db ".backup glou-backup.db"
   gpg --symmetric --cipher-algo AES256 glou-backup.db
   rm glou-backup.db
   ```

## Rotation de la Clé de Chiffrement

Procédure pour changer la passphrase :

```bash
# 1. Générer nouvelle passphrase
NEW_PASS=$(openssl rand -base64 48)

# 2. Arrêter le serveur
systemctl stop glou-server

# 3. Backup
cp glou.db glou.db.backup

# 4. Script de rechiffrement (à créer)
# Déchiffrer avec ancienne clé, rechiffrer avec nouvelle

# 5. Mettre à jour la configuration
export ENCRYPTION_PASSPHRASE="$NEW_PASS"

# 6. Redémarrer
systemctl start glou-server
```

## Troubleshooting

### Erreur : "failed to decrypt"

**Cause** : Passphrase ou salt incorrect

**Solution** :
1. Vérifiez que `ENCRYPTION_PASSPHRASE` est correct
2. Vérifiez que `ENCRYPTION_SALT` n'a pas changé
3. Restaurez depuis un backup si nécessaire

### Erreur : "passphrase must be at least 32 characters"

**Cause** : Passphrase trop courte

**Solution** :
```bash
# Générez une passphrase plus longue
openssl rand -base64 48
```

### Erreur : "encryption service not configured"

**Cause** : Service de chiffrement non initialisé

**Solution** :
```bash
# Assurez-vous que ces variables sont définies
export ENCRYPTION_PASSPHRASE="votre_passphrase_32_caracteres_minimum"
export ENCRYPTION_SALT="votre_salt_unique"
```

## Architecture Technique

### Flux de Chiffrement

```
Donnée en clair
    ↓
PBKDF2 (passphrase + salt) → Clé 256 bits
    ↓
AES-256-GCM + Nonce aléatoire
    ↓
Données chiffrées + Tag d'authentification
    ↓
Encodage Base64
    ↓
Stockage en base de données
```

### Flux de Déchiffrement

```
Données en base (Base64)
    ↓
Décodage Base64
    ↓
Extraction nonce + ciphertext + tag
    ↓
AES-256-GCM déchiffrement + vérification tag
    ↓
PBKDF2 (même passphrase + salt) → Clé 256 bits
    ↓
Donnée en clair
```

## Conformité ANSSI

✅ **Respecte les recommandations ANSSI 2024** :

- [x] AES-256 pour le chiffrement symétrique
- [x] Mode GCM pour confidentialité + authentification
- [x] PBKDF2 avec ≥ 100 000 itérations
- [x] Nonce unique par opération
- [x] Clé de 256 bits minimum
- [x] Générateur cryptographiquement sécurisé (`crypto/rand`)

## Références

- [Guide ANSSI - Sécurité des applications web](https://www.ssi.gouv.fr/)
- [Recommandations ANSSI - Cryptographie](https://www.ssi.gouv.fr/guide/mecanismes-cryptographiques/)
- [Documentation AES-GCM](https://pkg.go.dev/crypto/cipher#NewGCM)
- [PBKDF2 RFC 8018](https://tools.ietf.org/html/rfc8018)

## Support

Pour toute question sur le chiffrement :
- Consultez [SECURITE_ANSSI.md](./SECURITE_ANSSI.md)
- Ouvrez une issue sur GitHub
- Contactez l'équipe de sécurité

---

**Dernière mise à jour** : 21 décembre 2024  
**Version** : 1.0
