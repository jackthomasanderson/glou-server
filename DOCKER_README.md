# 🐳 Glou Server - Guide Docker

## Démarrage Rapide

### 1️⃣ Avec Docker Compose (Recommandé)

```powershell
# Démarrer le serveur
docker-compose -f docker-compose.dev.yml up -d

# Voir les logs
docker logs -f glou-server-dev

# Arrêter le serveur
docker-compose -f docker-compose.dev.yml down
```

### 2️⃣ Avec le Script PowerShell (Plus Simple)

```powershell
# Démarrer
.\docker-dev.ps1 up

# Voir le statut
.\docker-dev.ps1 status

# Voir les logs
.\docker-dev.ps1 logs

# Redémarrer
.\docker-dev.ps1 restart

# Reconstruire l'image
.\docker-dev.ps1 rebuild

# Arrêter
.\docker-dev.ps1 down
```

## 🌐 Accès

- **Interface Web**: http://localhost:8080
- **Setup Wizard**: http://localhost:8080/setup
- **Health Check**: http://localhost:8080/health
- **API**: http://localhost:8080/wines, /tobacco, /caves, etc.

## 📁 Structure des Volumes

```
./data/        → Base de données SQLite (persistante)
./assets/      → Fichiers statiques (HTML, CSS, JS)
```

## ⚙️ Configuration

### Variables d'environnement (`.env`)

Les valeurs importantes à modifier :

```env
ENVIRONMENT=development
SESSION_SECRET=change-me-in-production
ENCRYPTION_PASSPHRASE=change-me-minimum-32-chars
ENCRYPTION_SALT=change-me-unique-per-installation
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

## 🔧 Développement

### Rebuild après modifications du code

```powershell
# Arrêter, reconstruire, redémarrer
.\docker-dev.ps1 rebuild
```

### Développement Frontend en parallèle

```powershell
# Terminal 1: Backend Docker
.\docker-dev.ps1 up

# Terminal 2: Frontend React
cd web
npm install
npm run dev
```

Le frontend (port 3000) communiquera avec l'API Docker (port 8080).

## 🗄️ Base de Données

### Réinitialiser la base de données

```powershell
# Arrêter le conteneur
docker-compose -f docker-compose.dev.yml down

# Supprimer la base
Remove-Item ./data/glou.db

# Redémarrer (créera une nouvelle base)
docker-compose -f docker-compose.dev.yml up -d
```

### Backup de la base

```powershell
# Copier depuis le conteneur
docker cp glou-server-dev:/data/glou.db ./backup-glou.db

# Restaurer
docker cp ./backup-glou.db glou-server-dev:/data/glou.db
docker-compose -f docker-compose.dev.yml restart
```

## 🏥 Monitoring

### Docker Desktop

1. Ouvrir Docker Desktop
2. Aller dans **Containers**
3. Cliquer sur `glou-server-dev`
4. Voir Logs, Stats, Inspect

### Ligne de commande

```powershell
# Stats en temps réel
docker stats glou-server-dev

# Logs
docker logs -f glou-server-dev --tail 100

# Inspecter le conteneur
docker inspect glou-server-dev

# Entrer dans le conteneur
docker exec -it glou-server-dev sh
```

## 🚀 Déploiement Production

### Utiliser docker-compose.prod.yml

```powershell
# Avec fichier de production
docker-compose -f docker-compose.prod.yml up -d

# Vérifier
docker ps
docker logs glou-server
```

### Variables d'environnement sécurisées

⚠️ **IMPORTANT**: En production, utilisez des valeurs sécurisées :

```env
ENVIRONMENT=production
SESSION_SECRET=<généré avec: openssl rand -base64 48>
ENCRYPTION_PASSPHRASE=<généré avec: openssl rand -base64 48>
ENCRYPTION_SALT=<unique par installation>
```

## 🐛 Dépannage

### Le conteneur ne démarre pas

```powershell
# Voir les logs d'erreur
docker logs glou-server-dev

# Vérifier le fichier .env
Get-Content .env

# Vérifier les ports
netstat -ano | findstr ":8080"
```

### Erreur "port already in use"

```powershell
# Trouver le processus utilisant le port 8080
Get-NetTCPConnection -LocalPort 8080 | Select-Object -ExpandProperty OwningProcess
Stop-Process -Id <PID>
```

### Rebuild complet

```powershell
# Tout supprimer et recommencer
docker-compose -f docker-compose.dev.yml down
docker system prune -a
docker-compose -f docker-compose.dev.yml up -d --build
```

## 📊 Vérification Post-Démarrage

### Tests manuels

```powershell
# 1. Health check
curl http://localhost:8080/health

# 2. Setup status
curl http://localhost:8080/api/setup/check

# 3. Accès web
Start-Process "http://localhost:8080/setup"
```

### Tests automatisés (avec le script)

```powershell
.\docker-dev.ps1 status
```

## 🆘 Support

- Voir les logs: `docker logs -f glou-server-dev`
- Documentation complète: [DOCKER_TESTING.md](./DOCKER_TESTING.md)
- Issues GitHub: https://github.com/jackthomasanderson/glou-server/issues

---

**Bon développement! 🍷**
