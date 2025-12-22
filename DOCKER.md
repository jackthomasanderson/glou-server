# 🐳 Guide Docker - Glou Server

Guide complet pour déployer Glou Server avec Docker en self-hosted.

---

## 📦 Images Disponibles

### GitHub Container Registry (Recommandé)
```bash
ghcr.io/VOTRE-USERNAME/glou-server:latest      # Dernière version stable
ghcr.io/VOTRE-USERNAME/glou-server:main        # Branche main
ghcr.io/VOTRE-USERNAME/glou-server:develop     # Branche develop
```

### Build local
Vous pouvez aussi builder l'image localement :
```bash
docker build -t glou-server:local .
```

---

## 🚀 Démarrage Rapide (5 minutes)

### 1. Préparer l'environnement

```bash
# Créer les dossiers de données
mkdir -p data backups

# Copier la configuration exemple
cp .env.example .env

# Éditer la configuration (IMPORTANT!)
nano .env  # ou notepad .env sur Windows
```

**Configuration minimale requise dans `.env`** :
```env
ENCRYPTION_PASSPHRASE=votre_phrase_tres_longue_et_securisee_minimum_32_caracteres
ENCRYPTION_SALT=glou-prod-$(openssl rand -hex 16)
SESSION_SECRET=$(openssl rand -hex 32)
```

### 2. Lancer avec Docker Compose

#### Mode Production (image pré-buildée)
```bash
docker compose -f docker-compose.prod.yml up -d
```

#### Mode Development (build local)
```bash
docker compose up -d
```

### 3. Vérifier le fonctionnement

```bash
# Voir les logs
docker logs -f glou-server

# Vérifier le statut
docker ps

# Tester l'API
curl http://localhost:8080/health
```

### 4. Accéder à l'interface

Ouvrez votre navigateur : **http://localhost:8080**

---

## 🔧 Configuration Avancée

### Variables d'environnement

Toutes les variables disponibles dans [.env.example](.env.example).

**Essentielles** :
- `ENCRYPTION_PASSPHRASE` - Clé de chiffrement (32+ caractères) **OBLIGATOIRE**
- `ENCRYPTION_SALT` - Salt unique pour cette installation **OBLIGATOIRE**
- `SESSION_SECRET` - Secret des sessions (32+ caractères) **OBLIGATOIRE**
- `DB_PATH` - Chemin de la base de données (défaut: `/data/glou.db`)

**Serveur** :
- `PORT` - Port d'écoute (défaut: `8080`)
- `ENVIRONMENT` - `production` ou `development`
- `PUBLIC_DOMAIN` - Domaine public (ex: `glou.example.com`)
- `PUBLIC_PROTOCOL` - `http` ou `https`

**Sécurité** :
- `CORS_ALLOWED_ORIGINS` - Origines autorisées (séparées par virgules)
- `RATE_LIMIT_REQUESTS` - Nombre de requêtes max (défaut: `100`)
- `RATE_LIMIT_WINDOW_SECONDS` - Fenêtre de rate limiting (défaut: `60`)

**Notifications** :
- `GOTIFY_URL` - URL de votre serveur Gotify
- `GOTIFY_TOKEN` - Token d'application Gotify
- `SMTP_*` - Configuration email (voir `.env.example`)

### Volumes

Le container utilise deux volumes principaux :

```yaml
volumes:
  - ./data:/data          # Base de données SQLite
  - ./backups:/backups    # Backups automatiques
```

**Permissions** (Linux/Mac) :
```bash
chmod 700 data backups
chown 1000:1000 data backups  # UID/GID du container
```

### Ports

Par défaut, le port `8080` est exposé. Pour changer :

```yaml
ports:
  - "8081:8080"  # Host:Container
```

Ou via variable d'environnement :
```env
PORT=8081
```

### Limites de ressources

```yaml
deploy:
  resources:
    limits:
      memory: 512M      # Maximum 512 MB RAM
      cpus: '1.0'       # Maximum 1 CPU
    reservations:
      memory: 128M      # Minimum 128 MB RAM
      cpus: '0.25'      # Minimum 0.25 CPU
```

---

## 📚 Commandes Docker Utiles

### Gestion du container

```bash
# Démarrer
docker compose -f docker-compose.prod.yml up -d

# Arrêter
docker compose -f docker-compose.prod.yml down

# Redémarrer
docker compose -f docker-compose.prod.yml restart

# Voir les logs
docker logs -f glou-server

# Logs avec tail
docker logs --tail 100 -f glou-server

# Statut
docker ps

# Inspection détaillée
docker inspect glou-server
```

### Accès au container

```bash
# Shell dans le container
docker exec -it glou-server sh

# Exécuter une commande
docker exec glou-server ls -la /data

# Copier des fichiers
docker cp glou-server:/data/glou.db ./backup.db
docker cp ./restore.db glou-server:/data/glou.db
```

### Gestion des images

```bash
# Lister les images
docker images

# Pull la dernière version
docker pull ghcr.io/VOTRE-USERNAME/glou-server:latest

# Build local
docker build -t glou-server:local .

# Tag une image
docker tag glou-server:local glou-server:v1.0.0

# Supprimer une image
docker rmi glou-server:local
```

### Nettoyage

```bash
# Supprimer les containers arrêtés
docker container prune

# Supprimer les images non utilisées
docker image prune

# Supprimer les volumes non utilisés
docker volume prune

# Nettoyage complet (attention !)
docker system prune -a
```

---

## 🔄 Mises à jour

### Mise à jour depuis GitHub Container Registry

```bash
# 1. Arrêter le container
docker compose -f docker-compose.prod.yml down

# 2. Pull la dernière image
docker pull ghcr.io/VOTRE-USERNAME/glou-server:latest

# 3. Recréer le container
docker compose -f docker-compose.prod.yml up -d --force-recreate

# Alternative en une ligne
docker compose -f docker-compose.prod.yml pull && \
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### Mise à jour avec build local

```bash
# 1. Pull les derniers changements
git pull origin main

# 2. Rebuild l'image
docker compose build --no-cache

# 3. Recréer le container
docker compose up -d --force-recreate
```

---

## 💾 Backup et Restauration

### Backup automatique

Le serveur crée des backups automatiques dans `/backups` :
- Fréquence : Tous les jours à 2h du matin
- Format : `glou-backup-YYYY-MM-DD.db`
- Rétention : 30 jours (configurable)

### Backup manuel

#### Méthode 1 : Copie directe
```bash
# Copier la DB depuis le container
docker cp glou-server:/data/glou.db ./backup-$(date +%Y%m%d).db
```

#### Méthode 2 : Via volume
```bash
# Les données sont dans ./data/
cp ./data/glou.db ./backups/manual-backup-$(date +%Y%m%d).db
```

#### Méthode 3 : Dump SQL
```bash
# Dump de la base de données
docker exec glou-server sh -c "sqlite3 /data/glou.db .dump" > backup.sql
```

### Restauration

```bash
# 1. Arrêter le container
docker compose -f docker-compose.prod.yml down

# 2. Restaurer la base de données
cp ./backups/glou-backup-2025-01-15.db ./data/glou.db

# 3. Redémarrer
docker compose -f docker-compose.prod.yml up -d
```

### Backup externe automatique

#### Script de backup vers NAS (Linux/Mac)
```bash
#!/bin/bash
# backup-to-nas.sh

BACKUP_DIR="/mnt/nas/backups/glou"
SOURCE_DIR="./data"

# Créer un backup daté
rsync -av --delete \
  "$SOURCE_DIR/" \
  "$BACKUP_DIR/$(date +%Y-%m-%d)/"

# Garder seulement les 30 derniers jours
find "$BACKUP_DIR" -type d -mtime +30 -exec rm -rf {} \;
```

Ajoutez au cron :
```bash
0 3 * * * /path/to/backup-to-nas.sh
```

#### Script PowerShell (Windows)
```powershell
# backup-to-nas.ps1
$backupDir = "\\NAS\backups\glou"
$sourceDir = ".\data"
$date = Get-Date -Format "yyyy-MM-dd"

# Créer le backup
robocopy $sourceDir "$backupDir\$date" /MIR /Z /W:5

# Supprimer les backups de plus de 30 jours
Get-ChildItem $backupDir -Directory | 
  Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-30)} |
  Remove-Item -Recurse -Force
```

Planifier avec Task Scheduler.

---

## 🌐 Reverse Proxy

Pour exposer Glou Server sur Internet avec HTTPS.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name glou.example.com;

    ssl_certificate /etc/letsencrypt/live/glou.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/glou.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support (si nécessaire)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

N'oubliez pas de configurer :
```env
PUBLIC_DOMAIN=glou.example.com
PUBLIC_PROTOCOL=https
TRUST_PROXY_HEADERS=true
```

### Traefik

```yaml
# docker-compose.traefik.yml
version: "3.8"

services:
  glou-server:
    image: ghcr.io/VOTRE-USERNAME/glou-server:latest
    container_name: glou-server
    networks:
      - traefik
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.glou.rule=Host(`glou.example.com`)"
      - "traefik.http.routers.glou.entrypoints=websecure"
      - "traefik.http.routers.glou.tls.certresolver=letsencrypt"
      - "traefik.http.services.glou.loadbalancer.server.port=8080"

networks:
  traefik:
    external: true
```

### Caddy (le plus simple)

```caddyfile
# Caddyfile
glou.example.com {
    reverse_proxy localhost:8080
}
```

Caddy gère automatiquement HTTPS avec Let's Encrypt !

---

## 🔒 Sécurité

### Bonnes pratiques

1. **Secrets** : Utilisez des secrets forts (32+ caractères)
   ```bash
   # Générer des secrets sécurisés
   openssl rand -base64 48
   ```

2. **Permissions** : Limitez l'accès aux fichiers
   ```bash
   chmod 600 .env
   chmod 700 data backups
   ```

3. **Utilisateur non-root** : Le container utilise l'UID 1000
   ```dockerfile
   USER glou  # Non-root user
   ```

4. **Réseau** : Utilisez un réseau bridge dédié
   ```yaml
   networks:
     glou-network:
       driver: bridge
   ```

5. **Healthcheck** : Activé par défaut
   ```yaml
   healthcheck:
     test: ["CMD", "wget", "--spider", "http://localhost:8080/health"]
     interval: 30s
   ```

6. **Limites de ressources** : Protégez contre les abus
   ```yaml
   deploy:
     resources:
       limits:
         memory: 512M
   ```

### Scan de vulnérabilités

```bash
# Avec Docker Scout
docker scout cves glou-server:latest

# Avec Trivy
trivy image glou-server:latest

# Avec Snyk
snyk container test glou-server:latest
```

---

## 🐛 Dépannage

### Le container ne démarre pas

```bash
# Voir les logs détaillés
docker logs glou-server

# Vérifier la configuration
docker compose -f docker-compose.prod.yml config

# Vérifier les permissions
ls -la data/

# Tester sans détacher
docker compose -f docker-compose.prod.yml up
```

### Erreur "encryption passphrase required"

Vérifiez que `.env` contient :
```env
ENCRYPTION_PASSPHRASE=votre_phrase_minimum_32_caracteres
```

### Port déjà utilisé

```bash
# Trouver quel process utilise le port 8080
# Linux/Mac
sudo lsof -i :8080
# Windows
netstat -ano | findstr :8080

# Changer le port dans docker-compose.prod.yml
ports:
  - "8081:8080"
```

### Problèmes de permissions (Linux)

```bash
# Le container utilise UID 1000
sudo chown -R 1000:1000 data backups

# Ou utiliser votre propre UID
sudo chown -R $(id -u):$(id -g) data backups
```

### Base de données corrompue

```bash
# Vérifier l'intégrité
docker exec glou-server sqlite3 /data/glou.db "PRAGMA integrity_check;"

# Restaurer depuis un backup
docker compose down
cp ./backups/glou-backup-LATEST.db ./data/glou.db
docker compose up -d
```

### Problèmes de performances

```bash
# Augmenter les limites de ressources
docker compose -f docker-compose.prod.yml up -d \
  --scale glou-server=1 \
  --memory 1g \
  --cpus 2

# Vérifier l'utilisation des ressources
docker stats glou-server
```

### Healthcheck échoue

```bash
# Tester manuellement
docker exec glou-server wget --spider http://localhost:8080/health

# Voir les logs du healthcheck
docker inspect glou-server | jq '.[0].State.Health'
```

---

## 📊 Monitoring

### Logs

```bash
# Logs en temps réel
docker logs -f glou-server

# Logs des dernières heures
docker logs --since 2h glou-server

# Logs avec timestamps
docker logs -t glou-server
```

### Métriques

```bash
# Stats en temps réel
docker stats glou-server

# Stats au format JSON
docker stats --no-stream --format "{{json .}}" glou-server
```

### Intégration Prometheus

Ajoutez l'exporteur de métriques Docker :

```yaml
# docker-compose.monitoring.yml
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor
    ports:
      - "8081:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
```

---

## 🆘 Support

- 📖 [Documentation complète](DEPLOY.md)
- 🐛 [Signaler un bug](https://github.com/VOTRE-USERNAME/glou-server/issues)
- 💬 [Discussions](https://github.com/VOTRE-USERNAME/glou-server/discussions)

---

**🍷 Santé et longévité à votre cave !**
