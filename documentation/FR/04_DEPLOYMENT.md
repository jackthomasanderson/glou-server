# 🚀 DEPLOYMENT GUIDE - Glou

**Objectif:** Guide complet pour déployer Glou de développement à production  
**Cible:** Linux/Docker, VPS, ou cloud providers (AWS, DigitalOcean, Linode)

---

## 🏗️ ARCHITECTURE DÉPLOIEMENT

```
┌─────────────────────────────────────────────────┐
│ Client (Browser)                                │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────────────┐
│ Reverse Proxy (Nginx)                           │
│ - TLS/SSL termination                           │
│ - Rate limiting (nginx)                         │
│ - Gzip compression                              │
│ - Static file cache                             │
└──────────────────┬──────────────────────────────┘
                   │ HTTP
                   ▼
┌─────────────────────────────────────────────────┐
│ Glou API (Docker Container)                     │
│ - Go binary                                     │
│ - SQLite database                               │
│ - Environment-based config                      │
│ - Logging → stdout                              │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│ Volumes/Storage                                 │
│ - /data/glou.db (SQLite)                        │
│ - /var/log/glou/ (Logs)                         │
│ - /backups/ (Backups)                           │
└─────────────────────────────────────────────────┘
```

---

## 📋 PRÉ-REQUIS

### Minimal Setup
- [ ] Linux server (Ubuntu 22.04 LTS recommended)
- [ ] Docker & Docker Compose installed
- [ ] DNS configured (glou.example.com)
- [ ] SSL/TLS certificate (Let's Encrypt via Certbot)
- [ ] 2GB RAM, 1vCPU minimum
- [ ] 5GB disk space (for database + backups)

### Advanced Setup (Recommended)
- [ ] Docker Swarm or Kubernetes cluster
- [ ] PostgreSQL instead of SQLite (if multi-instance)
- [ ] Redis for session/cache (Phase 2)
- [ ] Prometheus + Grafana for monitoring
- [ ] Centralized logging (ELK, Loki, etc.)

---

## 📦 PHASE 1: PRÉPARATION (LOCAL)

### 1. Vérifier la build
```bash
cd /path/to/glou-server
go build ./cmd/api
./api -version  # Output: Glou v1.0.0
```

### 2. Tests avant deploy
```bash
go test ./...
go vet ./...

# Si disponible: go run github.com/golangci/golangci-lint/cmd/golangci-lint run
```

### 3. Créer l'image Docker
```bash
docker build -t glou:latest -t glou:$(git describe --tags) .
docker inspect glou:latest  # Vérifier les layers
```

### 4. Scanner les vulnérabilités
```bash
# Si Trivy installé
trivy image glou:latest

# Ou via Docker
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image glou:latest
```

---

## 🔧 PHASE 2: CONFIGURATION SERVEUR

### 1. Préparer les répertoires
```bash
# SSH sur le serveur production
ssh user@glou.example.com

# Créer la structure
sudo mkdir -p /opt/glou/{data,logs,backups,config}
sudo mkdir -p /etc/glou
sudo mkdir -p /var/www/glou-static

# Permissions
sudo chown -R glou:glou /opt/glou
sudo chmod 755 /opt/glou
sudo chmod 700 /opt/glou/data  # Isolate database
```

### 2. Configuration `.env.production`
```bash
sudo cat > /etc/glou/.env.production << 'EOF'
# Glou Production Configuration
ENVIRONMENT=production
PORT=8080
DB_PATH=/data/glou.db

# Security - Whitelist only your domain
CORS_ALLOWED_ORIGINS=https://glou.example.com
# Pour app mobile: CORS_ALLOWED_ORIGINS=https://glou.example.com,https://app.glou.example.com

# Rate Limiting (production aggressive)
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60

# Timeouts
REQUEST_TIMEOUT=30
MAX_REQUEST_BODY_SIZE=1048576

# Logging
LOG_LEVEL=info  # warn for production, debug for staging

# HTTPS (enforced by Nginx, Glou listens on HTTP internally)
# HTTPS_ENABLED=true
# HTTPS_CERT=/etc/letsencrypt/live/glou.example.com/fullchain.pem
# HTTPS_KEY=/etc/letsencrypt/live/glou.example.com/privkey.pem
EOF

sudo chmod 600 /etc/glou/.env.production
sudo chown glou:glou /etc/glou/.env.production
```

### 3. Créer l'utilisateur système
```bash
# Create non-root user for Glou service
sudo useradd -r -s /bin/false glou

# Verify
id glou
```

### 4. Configurer le Firewall
```bash
# UFW (Ubuntu)
sudo ufw enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Nginx redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw status
```

---

## 🐳 PHASE 3: DOCKER DEPLOYMENT

### Option A: Docker Standalone (Minimal)

```bash
# 1. Tag and push image
docker tag glou:latest glou:production
# docker push your-registry/glou:production  # If using private registry

# 2. Run container
docker run -d \
  --name glou-server \
  --user glou \
  --env-file /etc/glou/.env.production \
  -v /opt/glou/data:/data \
  -v /opt/glou/logs:/logs \
  -p 8080:8080 \
  --restart unless-stopped \
  --health-cmd="curl -f http://localhost:8080/api/health || exit 1" \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  glou:latest

# 3. Vérifier status
docker ps -a | grep glou
docker logs -f glou-server
```

### Option B: Docker Compose (Recommended)

```bash
sudo cat > /opt/glou/docker-compose.yml << 'EOF'
version: '3.9'

services:
  glou:
    image: glou:latest
    container_name: glou-server
    user: glou
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - ENVIRONMENT=production
      - PORT=8080
      - DB_PATH=/data/glou.db
      - CORS_ALLOWED_ORIGINS=https://glou.example.com
      - LOG_LEVEL=info
    volumes:
      - /opt/glou/data:/data
      - /opt/glou/logs:/logs
      - /opt/glou/backups:/backups
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - glou-network
    
    # Limites de ressources
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

  nginx:
    image: nginx:latest
    container_name: glou-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /etc/glou/nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt/live:/etc/letsencrypt:ro
      - /var/www/glou-static:/usr/share/nginx/html:ro
    networks:
      - glou-network
    depends_on:
      - glou

networks:
  glou-network:
    driver: bridge

volumes:
  glou-data:
    driver: local
EOF

cd /opt/glou
docker-compose up -d
docker-compose ps
docker-compose logs -f glou
```

---

## 🌐 PHASE 4: NGINX CONFIGURATION (HTTPS)

### 1. Obtenir un certificat SSL
```bash
# Via Certbot (Let's Encrypt gratuit)
sudo apt install certbot python3-certbot-nginx

sudo certbot certonly --standalone \
  -d glou.example.com \
  -d www.glou.example.com \
  --agree-tos -m admin@example.com

# Auto-renouvellement (Certbot gère automatiquement)
sudo systemctl enable certbot.timer
```

### 2. Configurer Nginx
```bash
sudo cat > /etc/glou/nginx.conf << 'EOF'
user nginx;
worker_processes auto;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1000;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss 
               application/javascript application/json;

    # Redirect HTTP → HTTPS
    server {
        listen 80 default_server;
        listen [::]:80 default_server;
        server_name glou.example.com www.glou.example.com;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://$server_name$request_uri;
        }
    }

    # HTTPS Server
    server {
        listen 443 ssl http2 default_server;
        listen [::]:443 ssl http2 default_server;
        server_name glou.example.com www.glou.example.com;

        ssl_certificate /etc/letsencrypt/live/glou.example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/glou.example.com/privkey.pem;
        
        # SSL Configuration (A+ score)
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

        # Security Headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

        root /usr/share/nginx/html;

        # Static assets (glou.html, CSS, JS)
        location / {
            try_files $uri $uri/ /glou.html;
            expires 1h;
            add_header Cache-Control "public, max-age=3600";
        }

        # API proxy to Glou backend
        location /api/ {
            proxy_pass http://glou:8080/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 30s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;
        }

        # Health check endpoint
        location /health {
            access_log off;
            proxy_pass http://glou:8080/api/health;
        }
    }
}
EOF

sudo chown root:root /etc/glou/nginx.conf
sudo chmod 644 /etc/glou/nginx.conf

# Test syntax
nginx -t
```

---

## 💾 PHASE 5: BACKUPS & RECOVERY

### Automated Backup Script
```bash
sudo cat > /opt/glou/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/glou/backups"
DB_PATH="/opt/glou/data/glou.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/glou_$TIMESTAMP.db.gz"

# Create backup
gzip -c "$DB_PATH" > "$BACKUP_FILE"

# Keep last 30 days of backups
find "$BACKUP_DIR" -type f -mtime +30 -delete

# Log
echo "Backup created: $BACKUP_FILE" >> /var/log/glou/backup.log

# Optional: Upload to cloud (AWS S3, etc.)
# aws s3 cp "$BACKUP_FILE" s3://my-bucket/glou-backups/
EOF

sudo chmod +x /opt/glou/backup.sh

# Schedule daily backup at 2 AM
sudo crontab -e
# Add: 0 2 * * * /opt/glou/backup.sh
```

### Recovery Procedure
```bash
# 1. Stop container
docker-compose stop glou

# 2. Restore backup
gunzip -c /opt/glou/backups/glou_20250121_020000.db.gz > /opt/glou/data/glou.db

# 3. Fix permissions
sudo chown glou:glou /opt/glou/data/glou.db
sudo chmod 600 /opt/glou/data/glou.db

# 4. Restart
docker-compose start glou

# 5. Verify
docker-compose logs glou | tail -20
curl https://glou.example.com/api/health
```

---

## 📊 PHASE 6: MONITORING & LOGGING

### 1. Logs Centralisés
```bash
# See real-time logs
docker-compose logs -f glou

# Logs rotation
sudo cat > /etc/logrotate.d/glou << 'EOF'
/opt/glou/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 glou glou
    sharedscripts
    postrotate
        docker-compose -f /opt/glou/docker-compose.yml restart glou > /dev/null 2>&1 || true
    endscript
}
EOF
```

### 2. Health Monitoring
```bash
# Manual check
curl https://glou.example.com/api/health

# Automated check (every 5 min)
*/5 * * * * curl -f https://glou.example.com/api/health || \
  echo "Glou health check failed at $(date)" | \
  mail -s "Glou Alert" admin@example.com
```

### 3. Prometheus Metrics (Optional)
```go
// Ajouter à cmd/api/main.go pour Phase 2
import "github.com/prometheus/client_golang/prometheus"

var (
    requestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "glou_requests_total",
            Help: "Total requests",
        },
        []string{"method", "path", "status"},
    )
)

// Exposer sur /metrics
http.Handle("/metrics", promhttp.Handler())
```

---

## 🔄 PHASE 7: CI/CD PIPELINE (GitHub Actions)

### Workflow Template
```yaml
# .github/workflows/deploy.yml
name: Deploy Glou

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Go
        uses: actions/setup-go@v4
        with:
          go-version: 1.24
      
      - name: Run tests
        run: go test -v -cover ./...
      
      - name: Build binary
        run: go build -o api ./cmd/api
      
      - name: Build Docker image
        run: docker build -t glou:${{ github.sha }} .
      
      - name: Scan vulnerabilities
        run: |
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy image glou:${{ github.sha }}
      
      - name: Deploy to production
        if: startsWith(github.ref, 'refs/tags/')
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
        run: |
          # Deploy script here
          ssh -i $DEPLOY_KEY user@glou.example.com << 'EOSSH'
            cd /opt/glou
            docker-compose pull
            docker-compose up -d
          EOSSH
```

---

## ✅ CHECKLIST DE DÉPLOIEMENT

### Avant Deploy
- [ ] Tous les tests passent (`go test ./...`)
- [ ] Build localement vérifié (`go build ./cmd/api`)
- [ ] Image Docker buildée et scannée (`trivy image`)
- [ ] Secrets NOT in .env or Dockerfile
- [ ] SSL certificate valid and renewed auto
- [ ] Backup strategy tested (restore works)
- [ ] Nginx configuration syntax verified
- [ ] Rate limits configured pour prod (100 req/min)
- [ ] CORS whitelist has ONLY production domain
- [ ] LOG_LEVEL set to "info" (not "debug")

### Après Deploy
- [ ] Health check returns 200 ✅
- [ ] Frontend loads at https://glou.example.com
- [ ] API endpoints respond (curl /api/wines)
- [ ] Database integrity verified (SELECT COUNT)
- [ ] SSL check: https://www.ssllabs.com/ssltest/
- [ ] Logs being written correctly
- [ ] Backup job scheduled and tested
- [ ] Monitoring/alerts active
- [ ] Team notified of deployment

### Jours 1-7
- [ ] Monitor error rates and response times
- [ ] Collect user feedback on performance
- [ ] Test recovery procedures (backup restore)
- [ ] Performance baseline established
- [ ] Security audit scheduled

---

## 🔍 TROUBLESHOOTING

### Symptôme: Container keeps restarting
```bash
docker-compose logs glou | tail -50
# Check: env vars set? PORT right? DB path accessible?
```

### Symptôme: SSL certificate errors
```bash
# Check expiration
curl -vI https://glou.example.com

# Check file permissions
ls -la /etc/letsencrypt/live/glou.example.com/

# Renew manually
sudo certbot renew --force-renewal
```

### Symptôme: Rate limiting too aggressive
```bash
# Adjust in .env
RATE_LIMIT_REQUESTS=200  # Increase from 100
RATE_LIMIT_WINDOW=60

# Restart
docker-compose restart glou
```

### Symptôme: Slow performance
```bash
# Check disk I/O
iostat -x 1 5

# Check database size
ls -lh /opt/glou/data/glou.db

# Vacuum if needed
docker-compose exec glou sqlite3 /data/glou.db VACUUM;
```

---

## 📞 POST-DEPLOYMENT SUPPORT

**Issue Tracker:** GitHub Issues  
**Monitoring Alert:** monitoring@example.com  
**Escalation:** DevOps team  
**War Room:** Slack #glou-incidents

---

## 🎯 NEXT STEPS (Phase 2 Features)

- [ ] JWT Authentication (user accounts)
- [ ] PostgreSQL for multi-instance
- [ ] Redis for caching
- [ ] Prometheus metrics export
- [ ] Kubernetes deployment manifests
- [ ] Mobile app sync (iOS/Android)

---

**Version:** 1.0  
**Status:** ✅ Production Ready  
**Maintainer:** DevOps Team  
**Last Updated:** 2025-01-21
