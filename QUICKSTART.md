# 🚀 Démarrage Rapide - Glou Server

Guide de démarrage rapide en 5 minutes pour lancer votre propre instance Glou Server.

---

## 🎯 Choix de la méthode

| Méthode | Facilité | Recommandé pour |
|---------|----------|-----------------|
| **🐳 Docker** | ⭐⭐⭐⭐⭐ | Production, auto-hébergement |
| **📦 Binaire** | ⭐⭐⭐⭐ | Tests rapides, Windows |
| **🛠️ Source** | ⭐⭐⭐ | Développement, personnalisation |

---

## Méthode 1 : Docker (Recommandé) 🐳

### Prérequis
- Docker Desktop installé ([télécharger](https://www.docker.com/products/docker-desktop))

### Installation (5 minutes)

#### Windows
```powershell
# 1. Télécharger les fichiers nécessaires
# Cloner le repo OU télécharger docker-compose.prod.yml et .env.example

# 2. Configurer
Copy-Item .env.example .env
notepad .env  # Éditez les valeurs (voir ci-dessous)

# 3. Lancer automatiquement
.\deploy-windows.ps1
```

#### Linux / Mac
```bash
# 1. Télécharger les fichiers nécessaires
# Cloner le repo OU télécharger docker-compose.prod.yml et .env.example

# 2. Configurer
cp .env.example .env
nano .env  # Éditez les valeurs (voir ci-dessous)

# 3. Lancer automatiquement
chmod +x deploy-linux.sh
./deploy-linux.sh
```

### Configuration Minimale

Éditez le fichier `.env` avec ces valeurs **OBLIGATOIRES** :

```env
# Générez une phrase de passe FORTE (minimum 32 caractères)
ENCRYPTION_PASSPHRASE=ma_phrase_super_longue_et_securisee_32_caracteres_minimum

# Salt unique (changez pour chaque installation!)
ENCRYPTION_SALT=glou-prod-votre-salt-unique-ici

# Secret de session (32+ caractères)
SESSION_SECRET=votre-secret-de-session-tres-long-aussi
```

**💡 Astuce** : Générer des secrets sécurisés :
```bash
# Linux/Mac
openssl rand -base64 48

# PowerShell (Windows)
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 48 | % {[char]$_})
```

### Vérification

```bash
# Voir les logs
docker logs -f glou-server

# Vérifier que le serveur est "healthy"
docker ps
```

### Accès

Ouvrez votre navigateur : **http://localhost:8080**

Au premier démarrage, suivez l'assistant de configuration pour créer votre compte administrateur.

---

## Méthode 2 : Binaire Standalone 📦

Idéal pour tester rapidement sans Docker.

### Windows

1. **Télécharger le binaire**
   - Allez sur [Releases](https://github.com/VOTRE-USERNAME/glou-server/releases)
   - Téléchargez `glou-server-windows-amd64.exe`

2. **Créer la structure**
   ```powershell
   # Créer un dossier
   New-Item -ItemType Directory -Force -Path "C:\Glou"
   cd C:\Glou
   
   # Créer les sous-dossiers
   New-Item -ItemType Directory -Force -Path "data", "assets"
   
   # Placer le binaire et le renommer
   # Copiez glou-server-windows-amd64.exe ici → glou-server.exe
   ```

3. **Télécharger les assets**
   - Téléchargez le dossier `assets/` depuis le repo
   - Placez-le dans `C:\Glou\assets\`

4. **Créer un script de démarrage** (`start.ps1`)
   ```powershell
   $env:ENCRYPTION_PASSPHRASE="votre_phrase_minimum_32_caracteres"
   $env:ENCRYPTION_SALT="glou-prod-unique"
   $env:SESSION_SECRET=(New-Guid).ToString() + (New-Guid).ToString()
   $env:DB_PATH="./data/glou.db"
   
   .\glou-server.exe
   ```

5. **Lancer**
   ```powershell
   .\start.ps1
   ```

### Linux

1. **Télécharger et installer**
   ```bash
   # AMD64 (Intel/AMD)
   wget https://github.com/VOTRE-USERNAME/glou-server/releases/latest/download/glou-server-linux-amd64
   chmod +x glou-server-linux-amd64
   sudo mv glou-server-linux-amd64 /usr/local/bin/glou-server
   
   # ARM64 (Raspberry Pi)
   wget https://github.com/VOTRE-USERNAME/glou-server/releases/latest/download/glou-server-linux-arm64
   chmod +x glou-server-linux-arm64
   sudo mv glou-server-linux-arm64 /usr/local/bin/glou-server
   ```

2. **Créer la structure**
   ```bash
   sudo mkdir -p /opt/glou/{data,assets}
   cd /opt/glou
   # Télécharger et placer le dossier assets/ ici
   ```

3. **Créer un service systemd** (`/etc/systemd/system/glou.service`)
   ```ini
   [Unit]
   Description=Glou Server
   After=network.target
   
   [Service]
   Type=simple
   User=glou
   WorkingDirectory=/opt/glou
   ExecStart=/usr/local/bin/glou-server
   Environment="ENCRYPTION_PASSPHRASE=CHANGEZ_MOI"
   Environment="ENCRYPTION_SALT=glou-unique"
   Environment="SESSION_SECRET=CHANGEZ_MOI_AUSSI"
   Environment="DB_PATH=/opt/glou/data/glou.db"
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   ```

4. **Activer et démarrer**
   ```bash
   # Créer l'utilisateur
   sudo useradd -r -s /bin/false glou
   sudo chown -R glou:glou /opt/glou
   
   # Lancer le service
   sudo systemctl daemon-reload
   sudo systemctl enable glou
   sudo systemctl start glou
   sudo systemctl status glou
   ```

---

## Méthode 3 : Build depuis les Sources 🛠️

Pour les développeurs ou si vous voulez personnaliser.

### Prérequis
- Go 1.23+ ([télécharger](https://go.dev/dl/))
- Git

### Étapes

```bash
# 1. Cloner le repository
git clone https://github.com/VOTRE-USERNAME/glou-server.git
cd glou-server

# 2. Installer les dépendances
go mod download

# 3. Builder le binaire
go build -o glou-server ./cmd/api

# 4. Configurer
cp .env.example .env
nano .env  # Éditer les valeurs

# 5. Lancer
./glou-server
```

---

## 🔧 Configuration Post-Installation

### Premier démarrage

1. **Accédez à l'interface** : http://localhost:8080
2. **Assistant de configuration** : Créez votre compte administrateur
3. **Paramètres** : Configurez vos préférences

### Configuration optionnelle

#### Notifications Gotify
```env
GOTIFY_URL=http://votre-gotify.com
GOTIFY_TOKEN=votre-token
```

#### Notifications Email (SMTP)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=votre.email@gmail.com
SMTP_PASSWORD=votre-mot-de-passe-application
SMTP_FROM=glou@example.com
SMTP_TO=vous@example.com
```

#### Accès depuis Internet (HTTPS)
```env
PUBLIC_DOMAIN=glou.votredomaine.com
PUBLIC_PROTOCOL=https
TRUST_PROXY_HEADERS=true
```

Utilisez un reverse proxy (Nginx, Traefik, Caddy) - Voir [DOCKER.md](DOCKER.md#-reverse-proxy)

---

## 📱 Application Mobile

Une fois le serveur lancé, vous pouvez utiliser l'application Android :

1. **Télécharger** l'app Glou depuis le Play Store (ou depuis les releases GitHub)
2. **Configurer** l'URL du serveur : `http://VOTRE-IP:8080`
3. **Se connecter** avec vos identifiants

---

## 🎯 Prochaines Étapes

- 📖 Lire le [Guide Utilisateur](docs/FR/USER_GUIDE.md)
- 🐳 Configurer le [Reverse Proxy](docs/FR/REVERSE_PROXY.md) pour HTTPS
- 🔒 Renforcer la [Sécurité](docs/FR/SECURITY.md)
- 💾 Configurer les [Backups automatiques](DOCKER.md#-backup-et-restauration)
- 🔔 Paramétrer les [Notifications](docs/FR/USER_GUIDE.md#notifications)

---

## ⚠️ Points Importants

### Sécurité
- ✅ Utilisez des secrets forts (32+ caractères)
- ✅ Changez `ENCRYPTION_SALT` pour chaque installation
- ✅ Ne commitez JAMAIS le fichier `.env`
- ✅ Utilisez HTTPS en production (reverse proxy)
- ✅ Backups réguliers de la base de données

### Backup
Le serveur fait des backups automatiques tous les jours à 2h du matin dans `./backups/`.

**Backup manuel** :
```bash
# Docker
docker cp glou-server:/data/glou.db ./backup.db

# Binaire
cp ./data/glou.db ./backup.db
```

### Mise à jour

**Docker** :
```bash
docker pull ghcr.io/VOTRE-USERNAME/glou-server:latest
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

**Binaire** :
- Téléchargez la nouvelle version
- Arrêtez le serveur
- Remplacez le binaire
- Redémarrez

---

## 🆘 Problèmes Courants

### Le serveur ne démarre pas
```bash
# Vérifier les logs
docker logs glou-server  # Docker
# ou
journalctl -u glou -f    # Linux systemd
```

### Erreur "encryption passphrase required"
→ Vérifiez que `ENCRYPTION_PASSPHRASE` est défini dans `.env` (minimum 32 caractères)

### Port 8080 déjà utilisé
→ Changez le port dans `.env` :
```env
PORT=8081
```

### Impossible d'accéder depuis un autre PC
→ Vérifiez le pare-feu :
```bash
# Windows
netsh advfirewall firewall add rule name="Glou Server" dir=in action=allow protocol=TCP localport=8080

# Linux
sudo ufw allow 8080/tcp
```

---

## 📚 Documentation Complète

- 🐳 [Guide Docker détaillé](DOCKER.md)
- 🚀 [Guide de déploiement complet](DEPLOY.md)
- 📖 [Documentation utilisateur](docs/FR/USER_GUIDE.md)
- 🔧 [Guide développeur](docs/FR/DEVELOPMENT.md)
- 🔒 [Guide sécurité](docs/FR/SECURITY.md)

---

## 💬 Support

- 🐛 [Signaler un bug](https://github.com/VOTRE-USERNAME/glou-server/issues)
- 💬 [Forum de discussions](https://github.com/VOTRE-USERNAME/glou-server/discussions)
- 📧 Contact : support@glou-server.com

---

**🍷 Bonne dégustation !**
