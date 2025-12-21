# 🔀 Data Migration Guide

Moving your Glou installation to a new server? This guide covers full migration with zero data loss.

---

## Migration Scenarios

- [Same server/new instance](#same-server-new-instance)
- [Different server](#different-server)
- [Docker to non-Docker](#docker-to-non-docker)
- [Non-Docker to Docker](#non-docker-to-docker)
- [Backup migration (multiple servers)](#backup-migration-multiple-servers)

---

## Same Server / New Instance

### Step 1: Export Data

```bash
curl -X GET http://localhost:8080/api/export/json \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o glou-migration.json

# Backup the database too
cp glou.db glou-migration-backup.db
```

### Step 2: Stop Old Instance

```bash
docker-compose down
# or
pkill -f "go run cmd/api"
```

### Step 3: Start New Instance

```bash
# Fresh installation
docker-compose up -d
# or
go run cmd/api/main.go
```

### Step 4: Restore Data

```bash
curl -X POST http://localhost:8080/api/import/json \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @glou-migration.json

# Verify data was imported
curl http://localhost:8080/api/wines \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.[] | .name' | head
```

---

## Different Server

### Step 1: Export from Old Server

On **old server**:
```bash
# Export data
curl -X GET http://old-server:8080/api/export/json \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o glou-migration.json

# Export backups (optional but recommended)
curl -X GET http://old-server:8080/api/export/wines-csv \
  > wines-backup.csv

curl -X GET http://old-server:8080/api/export/caves-csv \
  > caves-backup.csv

curl -X GET http://old-server:8080/api/export/tasting-history-csv \
  > tastings-backup.csv

# Copy database itself
scp user@old-server:/path/to/glou.db ./glou-migration-backup.db
```

### Step 2: Transfer Files to New Server

```bash
# Copy JSON export
scp glou-migration.json user@new-server:/tmp/

# Copy database backup (optional)
scp glou-migration-backup.db user@new-server:/tmp/
```

### Step 3: Setup New Server

On **new server**:

```bash
# Install Go (if not Docker)
# Clone Glou
git clone https://github.com/jackthomasanderson/glou-server.git
cd glou-server

# Build/run
docker-compose up -d
# or
go build -o api ./cmd/api && ./api
```

### Step 4: Import Data

```bash
# Wait for Glou to start (30 seconds)
sleep 30

# Import from JSON
curl -X POST http://localhost:8080/api/import/json \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @/tmp/glou-migration.json

# Verify
curl http://localhost:8080/api/caves \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.[] | .name'
```

---

## Docker to Non-Docker

### Step 1: Export from Docker

```bash
# Using running container
docker exec glou-container curl -X GET http://localhost:8080/api/export/json \
  -H "Authorization: Bearer YOUR_TOKEN" \
  > glou-migration.json

# Or access database directly
docker cp glou-container:/app/glou.db ./glou-migration-backup.db
```

### Step 2: Install Non-Docker

```bash
# Install Go 1.24+
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y golang-go

# macOS
brew install go

# Windows
# Download from https://go.dev/dl/

# Clone Glou
git clone https://github.com/jackthomasanderson/glou-server.git
cd glou-server
```

### Step 3: Restore

```bash
# Option A: Restore database directly
cp glou-migration-backup.db glou.db

# Start Glou
go build -o api ./cmd/api
./api
```

Or:

```bash
# Option B: Restore from JSON (better for cross-version)
./api &

sleep 10

curl -X POST http://localhost:8080/api/import/json \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @glou-migration.json
```

---

## Non-Docker to Docker

### Step 1: Export from Non-Docker

```bash
# Export via API (best option)
curl -X GET http://localhost:8080/api/export/json \
  -H "Authorization: Bearer YOUR_TOKEN" \
  > glou-migration.json

# Backup database
cp glou.db glou-migration-backup.db
```

### Step 2: Setup Docker

```bash
# Go to Docker directory
cd glou-server

# Start Glou
docker-compose up -d

# Wait for startup
sleep 30
```

### Step 3: Import

```bash
curl -X POST http://localhost:8080/api/import/json \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @glou-migration.json
```

---

## Backup Migration (Multiple Servers)

Migrate between multiple servers using backups as the source:

### Setup

```bash
# All servers on LAN: 192.168.1.100-102
# Backup location: /mnt/backups/glou/

# On backup server (192.168.1.105)
mkdir -p /mnt/backups/glou/{server1,server2,server3}
```

### On Each Server

```bash
# Server 1
0 2 * * * curl http://localhost:8080/api/export/json \
  -o /mnt/backups/glou/server1/glou-$(date +\%Y\%m\%d-\%H\%M\%S).json

# Server 2
0 2 * * * curl http://localhost:8080/api/export/json \
  -o /mnt/backups/glou/server2/glou-$(date +\%Y\%m\%d-\%H\%M\%S).json

# Etc...
```

### Restore from Backup

```bash
# Find latest backup
LATEST=$(ls -t /mnt/backups/glou/server1/*.json | head -1)

# Restore to different server
curl -X POST http://192.168.1.101:8080/api/import/json \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @$LATEST
```

---

## Pre-Migration Checklist

✅ **Before you migrate:**

- [ ] Stop adding new data 24h before migration
- [ ] Create full database backup
- [ ] Export JSON data
- [ ] Export CSV backups for manual review
- [ ] Test migration on staging server first
- [ ] Document all custom configurations (themes, domains, email)
- [ ] Note API keys and authentication tokens
- [ ] Get list of all users/permissions

---

## Post-Migration Checklist

✅ **After migration is complete:**

- [ ] Verify all wines imported (check wine count)
- [ ] Check all caves and cells are present
- [ ] Verify tasting history (random sample)
- [ ] Test alerts (should show same as before)
- [ ] Confirm activity logs migrated (if needed)
- [ ] Update DNS/proxies to point to new server
- [ ] Test app connections work
- [ ] Create first post-migration backup
- [ ] Document new server details (IP, paths, configs)

---

## Verification Commands

### Check Wine Count
```bash
curl http://localhost:8080/api/wines \
  -H "Authorization: Bearer YOUR_TOKEN" | jq 'length'
```

### Check Data Integrity
```bash
sqlite3 glou.db << EOF
SELECT 'Wines', COUNT(*) FROM wines
UNION ALL
SELECT 'Caves', COUNT(*) FROM caves
UNION ALL
SELECT 'Cells', COUNT(*) FROM cells
UNION ALL
SELECT 'Alerts', COUNT(*) FROM alerts
UNION ALL
SELECT 'Consumption History', COUNT(*) FROM consumption_history;
EOF
```

### Compare Before/After
```bash
# Before migration
curl http://old-server:8080/api/wines \
  -H "Authorization: Bearer TOKEN" | jq 'length' > before.txt

# After migration
curl http://new-server:8080/api/wines \
  -H "Authorization: Bearer TOKEN" | jq 'length' > after.txt

# Compare
diff before.txt after.txt
```

---

## Troubleshooting

### "Import failed: already exists"
This happens when importing twice. Solution:
```bash
# Fresh database first
rm glou.db  # or rename old one

# Restart Glou to create fresh DB
docker-compose down && docker-compose up -d

# Then import
curl -X POST http://localhost:8080/api/import/json ...
```

### "Wine count doesn't match"
```bash
# Check source database
sqlite3 old-glou.db "SELECT COUNT(*) FROM wines;"

# Check target database
sqlite3 new-glou.db "SELECT COUNT(*) FROM wines;"

# If mismatch, export from API and re-import
# (may have had unsaved changes when you exported)
```

### "Import timed out"
```bash
# For large datasets (>10,000 wines), increase timeout
curl --max-time 300 -X POST http://localhost:8080/api/import/json ...

# Or do batch import:
# Split glou-migration.json into smaller files
# Import each one separately
```

### "Port already in use"
```bash
# Find what's using port 8080
lsof -i :8080  # Linux/Mac
netstat -ano | findstr :8080  # Windows

# Kill it
kill -9 <PID>

# Or use different port
export PORT=8081 && go run cmd/api/main.go
```

---

## Rollback Plan

If migration fails:

```bash
# Stop new Glou
docker-compose down

# Restore backup
cp glou-backup-before-migration.db glou.db

# Start old Glou
docker-compose up -d

# Verify data is back
curl http://localhost:8080/api/wines \
  -H "Authorization: Bearer YOUR_TOKEN" | jq 'length'
```

---

## Support

Having issues? Check:
1. Both servers running same Glou version? (`git log --oneline | head`)
2. Proper authentication tokens passed?
3. Disk space available on new server?
4. Network connectivity between servers?
5. Activity logs show import errors? `/api/admin/activity-log`

For help: [GitHub Issues](https://github.com/jackthomasanderson/glou-server/issues)
