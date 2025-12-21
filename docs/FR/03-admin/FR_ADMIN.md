# 🔧 Glou - Administration Guide

**Version 1.0** | [Version française](FR_ADMIN.md)

Guide for system administrators managing a Glou instance.

---

## 📖 Table of Contents

1. [Installation and Deployment](#installation-and-deployment)
2. [Server Configuration](#server-configuration)
3. [Security](#security)
4. [Backup and Recovery](#backup-and-recovery)
5. [Troubleshooting](#troubleshooting)
6. [Performance](#performance)

---

## Installation and Deployment

### Requirements
- Docker and Docker Compose (recommended)
- Or Go 1.19+ and SQLite
- At least 512 MB of RAM
- 1 GB of disk space

### Deployment with Docker (Recommended)

1. **Clone the project**
```bash
git clone <repo-url>
cd glou-server
```

2. **Configuration**
```bash
cp .env.example .env
# Edit .env with your settings
```

3. **Launch**
```bash
docker-compose up -d
```

4. **Verification**
```bash
docker-compose logs api
# You should see: "Server started on :8080"
```

### Deployment Without Docker

1. **Prerequisites**
```bash
# Verify Go 1.19+
go version
```

2. **Installation**
```bash
go build -o api ./cmd/api
```

3. **Launch**
```bash
./api
```

---

## Server Configuration

### Environment Variables

Create a `.env` file:

```env
# Port
PORT=8080

# Database
DB_PATH=./data/glou.db

# Notifications
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASSWORD=your_password

GOTIFY_URL=https://gotify.example.com
GOTIFY_KEY=your_key

# Security
JWT_SECRET=your-very-long-secret-key-change-this
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# Interface
WEB_PORT=8080
DOMAIN=yourdomain.com
```

### Reverse Proxy (Nginx)

To expose Glou in production:

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
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### SSL/HTTPS with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --nginx -d glou.example.com

# Enable auto-renewal
sudo systemctl enable certbot.timer
```

---

## Security

### ✅ Security Checklist

- [ ] HTTPS enabled in production
- [ ] Valid SSL certificate
- [ ] JWT_SECRET changed and strong (>32 characters)
- [ ] CORS configured for your domains only
- [ ] Database backed up regularly
- [ ] Firewall configured (port 8080 accessible locally only)
- [ ] Reverse proxy in place
- [ ] Logging enabled and monitored
- [ ] Security updates applied regularly

### Authentication

By default, Glou does not enforce authentication. **Configure an authentication reverse proxy** such as:

- **nginx + auth_basic**
- **Keycloak**
- **Authentik**
- **OAuth2 Proxy**

Example with nginx (auth_basic):

```nginx
location / {
    auth_basic "Restricted Access";
    auth_basic_user_file /etc/nginx/.htpasswd;
    
    proxy_pass http://localhost:8080;
}
```

Generate `.htpasswd`:
```bash
htpasswd -c /etc/nginx/.htpasswd username
```

### Security Headers

Add to your reverse proxy:

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'" always;
```

### Firewall

```bash
# Allow only necessary traffic
sudo ufw allow 80/tcp    # HTTP (redirect)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 22/tcp    # SSH

# Internal port (not exposed)
sudo ufw limit 8080/tcp from 127.0.0.1
```

---

## Backup and Recovery

### Manual Backup

```bash
# Copy the database
cp ./data/glou.db ./backups/glou-$(date +%Y%m%d-%H%M%S).db

# Compress
tar -czf ./backups/glou-backup-$(date +%Y%m%d).tar.gz ./data
```

### Automated Backup with Cron

```bash
# Edit crontab
crontab -e

# Add (daily backup at 2 AM)
0 2 * * * /path/to/backup-script.sh
```

Script `backup-script.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/path/to/backups"
DB_PATH="/path/to/glou-server/data/glou.db"

cd /path/to/glou-server
docker-compose exec -T api tar czf - ./data | \
    gzip > $BACKUP_DIR/glou-$(date +\%Y\%m\%d-\%H\%M\%S).tar.gz

# Keep only the last 30 days
find $BACKUP_DIR -name "glou-*.tar.gz" -mtime +30 -delete
```

### Recovery

```bash
# Stop the service
docker-compose down

# Restore the database
rm ./data/glou.db
tar -xzf ./backups/glou-backup-20250121.tar.gz

# Restart
docker-compose up -d
```

---

## Troubleshooting

### Server Won't Start

**Symptom:** `docker-compose up -d` fails

**Solutions:**
```bash
# Check logs
docker-compose logs api

# Check the port
lsof -i :8080

# Free the port
kill -9 <PID>

# Restart
docker-compose restart
```

### Database Error

**Symptom:** `database is locked`

**Solution:**
```bash
# Stop all services
docker-compose down

# Wait 5 seconds
sleep 5

# Restart
docker-compose up -d
```

### Notifications Not Arriving

**Check Email:**
```bash
# Test SMTP connectivity
telnet smtp.example.com 587

# Check logs
docker-compose logs api | grep -i "smtp\|email"
```

**Check Gotify:**
```bash
# Test connectivity
curl -X POST https://gotify.example.com/message \
  -H "X-Gotify-Key: YOUR_KEY" \
  -F "title=Test" \
  -F "message=Test message"
```

### Slow Performance

**Solutions:**
1. Check available RAM
```bash
free -h
```

2. Increase Docker resources
```yaml
# docker-compose.yml
services:
  api:
    mem_limit: 1g
    cpus: "1.0"
```

3. Optimize the database
```bash
docker-compose exec api sqlite3 data/glou.db "VACUUM;"
```

---

## Performance

### Monitoring

Install **Prometheus + Grafana** to monitor:

```bash
docker-compose -f monitoring.yml up -d
```

### Logs

Configure log rotation:

```bash
# /etc/logrotate.d/glou
/var/log/glou/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 glou glou
}
```

### Scaling

For a highly available deployment:

1. **Load Balancer** (Nginx, HAProxy)
2. **Shared Database** (PostgreSQL)
3. **Shared Storage** (NFS, S3)

---

## Support and Maintenance

### Updates

```bash
# Pull the latest version
git pull origin main

# Rebuild Docker image
docker-compose build --no-cache

# Restart
docker-compose restart
```

### Audit Logs

Keep logs for audit purposes:

```bash
# Export logs
docker-compose logs api > logs/glou-$(date +%Y%m%d).log

# Compress
gzip logs/glou-$(date +%Y%m%d).log
```

---

**Need help?** Check the [technical documentation](API_REFERENCE.md).

Back to [User Guide](EN_USER_GUIDE.md).
