# 🚀 Guide de Déploiement Glou Server

Guide complet pour déployer Glou Server en self-hosted sur votre propre machine.

## 📋 Table des matières

1. [Prérequis](#prérequis)
2. [Méthode 1 : Docker (Recommandé)](#méthode-1--docker-recommandé)
3. [Méthode 2 : Binaire Standalone](#méthode-2--binaire-standalone)
4. [Configuration](#configuration)
5. [Sécurité](#sécurité)
6. [Backup et Restauration](#backup-et-restauration)
7. [Mise à jour](#mise-à-jour)
8. [Dépannage](#dépannage)

---

## Prérequis

### Pour Docker
- **Docker** 20.10+ : [Installer Docker](https://docs.docker.com/get-docker/)
- **Docker Compose** v2+ : Inclus avec Docker Desktop
- **Minimum** : 512 MB RAM, 1 GB espace disque
- **Recommandé** : 1 GB RAM, 5 GB espace disque

### Pour Binaire Standalone (Windows/Linux/Mac)
- **Aucune dépendance** : Le binaire est entièrement statique
- **Minimum** : 256 MB RAM, 500 MB espace disque
- **Recommandé** : 512 MB RAM, 2 GB espace disque

---

## Méthode 1 : Docker (Recommandé)

### Installation rapide (5 minutes)

#### 1. Télécharger les fichiers

```bash
# Cloner le repository (ou télécharger les fichiers nécessaires)
git clone https://github.com/VOTRE-USERNAME/glou-server.git
cd glou-server
```

Ou téléchargez uniquement les fichiers nécessaires :
- `docker-compose.prod.yml`
- `.env.example`

#### 2. Configurer les variables d'environnement

```bash
# Copier le fichier d'exemple
cp .env.example .env

# Éditer le fichier .env avec vos valeurs
nano .env  # ou notepad .env sur Windows
```

**Configuration minimale requise** :
```env
# Générez une passphrase forte (minimum 32 caractères)
ENCRYPTION_PASSPHRASE=votre_phrase_tres_longue_et_securisee_minimum_32_caracteres

# Salt unique pour cette installation
ENCRYPTION_SALT=glou-prod-$(openssl rand -hex 16)

# Session secret
SESSION_SECRET=$(openssl rand -hex 32)

# Domaine public (si accessible depuis internet)
PUBLIC_DOMAIN=votre-domaine.com
PUBLIC_PROTOCOL=https
```

#### 3. Créer les dossiers de données

```bash
mkdir -p data backups
chmod 700 data backups  # Linux/Mac uniquement
```

#### 4. Lancer le serveur

```bash
# Avec docker-compose v2+
docker compose -f docker-compose.prod.yml up -d

# Ou avec l'ancienne syntaxe
docker-compose -f docker-compose.prod.yml up -d
```

#### 5. Vérifier le fonctionnement

```bash
# Vérifier les logs
docker logs -f glou-server

# Vérifier le health check
docker ps  # Devrait afficher "healthy"
```

#### 6. Accéder à l'interface

Ouvrez votre navigateur : **http://localhost:8080**

Premier démarrage : configurez votre compte administrateur via l'interface de setup.

---

### Utiliser l'image depuis GitHub Container Registry

Si vous voulez utiliser l'image pré-buildée depuis GitHub Actions :

```yaml
# Dans docker-compose.prod.yml, l'image est déjà configurée
services:
  glou-server:
    image: ghcr.io/VOTRE-USERNAME/glou-server:latest
```

**Pull manuel de l'image** :
```bash
# Se connecter au GitHub Container Registry (si privé)
echo $GITHUB_TOKEN | docker login ghcr.io -u VOTRE-USERNAME --password-stdin

# Pull l'image
docker pull ghcr.io/VOTRE-USERNAME/glou-server:latest
```

---

## Méthode 2 : Binaire Standalone

Idéal si vous ne voulez pas utiliser Docker ou pour tester rapidement.

### Windows

#### 1. Télécharger le binaire

Allez sur la page [Releases](https://github.com/VOTRE-USERNAME/glou-server/releases) et téléchargez :
- `glou-server-windows-amd64.exe` (64-bit)
- `glou-server-windows-arm64.exe` (ARM 64-bit)

Ou récupérez-le depuis GitHub Actions artifacts.

#### 2. Créer la structure de dossiers

```powershell
# Créer un dossier pour Glou
New-Item -ItemType Directory -Force -Path "C:\Glou"
cd C:\Glou

# Créer les sous-dossiers
New-Item -ItemType Directory -Force -Path "data", "assets"

# Placer le binaire
# Copiez glou-server-windows-amd64.exe ici et renommez-le en glou-server.exe
```

#### 3. Télécharger les assets

Les assets (HTML, CSS, JS) sont nécessaires pour l'interface web.

Téléchargez le dossier `assets/` depuis le repository et placez-le dans `C:\Glou\assets\`.

#### 4. Configurer les variables d'environnement

Créez un fichier `start-glou.ps1` :

```powershell
# Configuration Glou Server
$env:ENVIRONMENT="production"
$env:PORT="8080"
$env:DB_PATH="./data/glou.db"

# SÉCURITÉ - À CHANGER !
$env:ENCRYPTION_PASSPHRASE="votre_phrase_tres_longue_et_securisee_minimum_32_caracteres"
$env:ENCRYPTION_SALT="glou-prod-" + (New-Guid).ToString()
$env:SESSION_SECRET=(New-Guid).ToString() + (New-Guid).ToString()

# Lancer le serveur
.\glou-server.exe
```

#### 5. Lancer le serveur

```powershell
# Lancer
.\start-glou.ps1

# Ou directement
.\glou-server.exe
```

#### 6. Créer un service Windows (optionnel)

Pour que Glou démarre automatiquement avec Windows :

```powershell
# Utiliser NSSM (Non-Sucking Service Manager)
# Télécharger : https://nssm.cc/download

# Installer le service
nssm install GlouServer "C:\Glou\glou-server.exe"
nssm set GlouServer AppDirectory "C:\Glou"
nssm set GlouServer AppEnvironmentExtra ENVIRONMENT=production DB_PATH=./data/glou.db

# Démarrer le service
nssm start GlouServer
```

---

### Linux

#### 1. Télécharger le binaire

```bash
# AMD64 (Intel/AMD)
wget https://github.com/VOTRE-USERNAME/glou-server/releases/latest/download/glou-server-linux-amd64
chmod +x glou-server-linux-amd64
mv glou-server-linux-amd64 /usr/local/bin/glou-server

# ARM64 (Raspberry Pi, etc.)
wget https://github.com/VOTRE-USERNAME/glou-server/releases/latest/download/glou-server-linux-arm64
chmod +x glou-server-linux-arm64
mv glou-server-linux-arm64 /usr/local/bin/glou-server
```

#### 2. Créer la structure

```bash
sudo mkdir -p /opt/glou/{data,assets,backups}
cd /opt/glou

# Télécharger les assets
# (copiez le dossier assets depuis le repository)
```

#### 3. Créer un service systemd

Créez `/etc/systemd/system/glou.service` :

```ini
[Unit]
Description=Glou Server - Wine Collection Management
After=network.target

[Service]
Type=simple
User=glou
Group=glou
WorkingDirectory=/opt/glou
ExecStart=/usr/local/bin/glou-server

# Variables d'environnement
Environment="ENVIRONMENT=production"
Environment="PORT=8080"
Environment="DB_PATH=/opt/glou/data/glou.db"
Environment="ENCRYPTION_PASSPHRASE=CHANGEZ_MOI_32_CARACTERES_MINIMUM"
Environment="ENCRYPTION_SALT=glou-prod-unique-salt"
Environment="SESSION_SECRET=CHANGEZ_MOI_AUSSI"

# Sécurité
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/glou/data /opt/glou/backups

# Restart
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 4. Créer l'utilisateur et configurer les permissions

```bash
# Créer un utilisateur dédié
sudo useradd -r -s /bin/false glou

# Permissions
sudo chown -R glou:glou /opt/glou
sudo chmod 700 /opt/glou/data /opt/glou/backups
```

#### 5. Activer et démarrer le service

```bash
# Recharger systemd
sudo systemctl daemon-reload

# Activer au démarrage
sudo systemctl enable glou

# Démarrer le service
sudo systemctl start glou

# Vérifier le statut
sudo systemctl status glou

# Voir les logs
sudo journalctl -u glou -f
```

---

### macOS

#### 1. Télécharger le binaire

```bash
# AMD64 (Intel Mac)
wget https://github.com/VOTRE-USERNAME/glou-server/releases/latest/download/glou-server-darwin-amd64
chmod +x glou-server-darwin-amd64
mv glou-server-darwin-amd64 /usr/local/bin/glou-server

# Note: Pour Apple Silicon (M1/M2), utilisez AMD64 avec Rosetta
# ou attendez le build ARM64 si disponible
```

#### 2. Créer la structure

```bash
mkdir -p ~/glou/{data,assets,backups}
cd ~/glou

# Télécharger les assets
```

#### 3. Créer un script de lancement

Créez `~/glou/start-glou.sh` :

```bash
#!/bin/bash
export ENVIRONMENT="production"
export PORT="8080"
export DB_PATH="$HOME/glou/data/glou.db"
export ENCRYPTION_PASSPHRASE="votre_phrase_tres_longue_et_securisee_minimum_32_caracteres"
export ENCRYPTION_SALT="glou-prod-$(uuidgen)"
export SESSION_SECRET="$(uuidgen)$(uuidgen)"

cd ~/glou
/usr/local/bin/glou-server
```

```bash
chmod +x ~/glou/start-glou.sh
```

#### 4. Lancer au démarrage (optionnel)

Créez `~/Library/LaunchAgents/com.glou.server.plist` :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.glou.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/VOTRE-USERNAME/glou/start-glou.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/Users/VOTRE-USERNAME/glou</string>
</dict>
</plist>
```

```bash
# Charger le service
launchctl load ~/Library/LaunchAgents/com.glou.server.plist

# Démarrer
launchctl start com.glou.server
```

---

## Configuration

### Variables d'environnement essentielles

| Variable | Description | Valeur par défaut | Obligatoire |
|----------|-------------|-------------------|-------------|
| `ENVIRONMENT` | Environnement d'exécution | `development` | Non |
| `PORT` | Port d'écoute | `8080` | Non |
| `DB_PATH` | Chemin de la base de données | `./glou.db` | Non |
| `ENCRYPTION_PASSPHRASE` | Clé de chiffrement (32+ chars) | - | **OUI en prod** |
| `ENCRYPTION_SALT` | Salt unique de chiffrement | - | **OUI en prod** |
| `SESSION_SECRET` | Secret des sessions (32+ chars) | - | **OUI en prod** |
| `PUBLIC_DOMAIN` | Domaine public | `localhost:8080` | Non |
| `PUBLIC_PROTOCOL` | Protocole (http/https) | `http` | Non |
| `CORS_ALLOWED_ORIGINS` | Origines CORS autorisées | - | Non |

### Notifications

#### Gotify
```env
GOTIFY_URL=http://gotify.example.com
GOTIFY_TOKEN=votre-token-gotify
```

#### SMTP (Email)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=glou@example.com
SMTP_TO=recipient@example.com
SMTP_USE_TLS=true
```

---

## Sécurité

### ⚠️ Points critiques

1. **ENCRYPTION_PASSPHRASE** : Minimum 32 caractères, unique, complexe
2. **ENCRYPTION_SALT** : Changez pour chaque installation
3. **SESSION_SECRET** : Minimum 32 caractères, aléatoire
4. **Fichier .env** : Ne JAMAIS commiter avec les vraies valeurs
5. **Permissions** : `chmod 600 .env` sur Linux/Mac

### Générer des secrets sécurisés

```bash
# Linux/Mac
openssl rand -base64 48

# PowerShell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

# En ligne
# https://www.random.org/passwords/
```

### Rotation des clés

**Recommandation ANSSI** : Rotation tous les 6-12 mois

1. Générer de nouveaux secrets
2. Mettre à jour `.env`
3. Redémarrer le serveur
4. Les données restent accessibles (migration automatique)

### HTTPS (Reverse Proxy)

Pour une utilisation en production avec HTTPS, utilisez un reverse proxy comme :
- **Nginx**
- **Traefik**
- **Caddy** (HTTPS automatique avec Let's Encrypt)

Voir [REVERSE_PROXY.md](docs/EN/REVERSE_PROXY.md) pour les configurations.

---

## Backup et Restauration

### Backup automatique

Le serveur Glou crée automatiquement des backups :
- Tous les jours à 2h du matin
- Stockés dans `./backups/`
- Format : `glou-backup-YYYY-MM-DD.db`

### Backup manuel

#### Docker
```bash
# Copier la base de données
docker cp glou-server:/data/glou.db ./backup-$(date +%Y%m%d).db

# Ou utiliser docker compose
docker compose -f docker-compose.prod.yml exec glou-server cp /data/glou.db /backups/manual-backup.db
```

#### Binaire
```bash
# Simple copie
cp ./data/glou.db ./backups/backup-$(date +%Y%m%d).db
```

### Restauration

```bash
# Arrêter le serveur
docker compose -f docker-compose.prod.yml down

# Restaurer depuis le backup
cp ./backups/glou-backup-2025-01-15.db ./data/glou.db

# Redémarrer
docker compose -f docker-compose.prod.yml up -d
```

### Backup externe (recommandé)

Configurez un backup externe automatique :
```bash
# Cron job (Linux/Mac)
0 3 * * * rsync -av /opt/glou/data/ user@backup-server:/backups/glou/

# Task Scheduler (Windows)
# Utilisez robocopy pour copier vers un NAS ou cloud
```

---

## Mise à jour

### Docker

```bash
# Pull la dernière image
docker pull ghcr.io/VOTRE-USERNAME/glou-server:latest

# Recréer le container
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### Binaire

```bash
# Télécharger la nouvelle version
wget https://github.com/VOTRE-USERNAME/glou-server/releases/latest/download/glou-server-linux-amd64

# Arrêter le service
sudo systemctl stop glou  # Linux
# ou Stop-Service GlouServer  # Windows

# Remplacer le binaire
mv glou-server-linux-amd64 /usr/local/bin/glou-server

# Redémarrer
sudo systemctl start glou  # Linux
# ou Start-Service GlouServer  # Windows
```

---

## Dépannage

### Le serveur ne démarre pas

```bash
# Vérifier les logs
docker logs glou-server

# Vérifier les permissions
ls -la ./data/

# Vérifier les variables d'environnement
docker compose -f docker-compose.prod.yml config
```

### Erreur "encryption passphrase required"

Vous devez définir `ENCRYPTION_PASSPHRASE` dans votre fichier `.env`.

### Port 8080 déjà utilisé

Changez le port dans `.env` :
```env
PORT=8081
```

Et dans `docker-compose.prod.yml` :
```yaml
ports:
  - "8081:8081"
```

### Base de données corrompue

```bash
# Restaurer depuis un backup
cp ./backups/glou-backup-LATEST.db ./data/glou.db

# Ou réparer avec SQLite
sqlite3 ./data/glou.db "PRAGMA integrity_check;"
```

### Problèmes de performances

```bash
# Augmenter les limites Docker
docker compose -f docker-compose.prod.yml up -d \
  --memory 1g --cpus 2
```

---

## Support

- 📖 [Documentation complète](docs/EN/README.md)
- 🐛 [Signaler un bug](https://github.com/VOTRE-USERNAME/glou-server/issues)
- 💬 [Discussions](https://github.com/VOTRE-USERNAME/glou-server/discussions)

---

**🍷 Profitez de votre cave numérique !**
