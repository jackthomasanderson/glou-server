# 📥 Backup & Restore Guide

## Overview

Glou stores all data in a self-hosted SQLite database. This guide covers backup, restore, and data security strategies.

---

## 🔐 Data Location

By default, your wine collection is stored in:
```
glou-server/glou.db
```

This SQLite database contains:
- ✅ All wines
- ✅ Cave configurations
- ✅ Tasting notes & ratings
- ✅ Alerts and preferences
- ✅ Activity logs

---

## 💾 Manual Backup

### Local Installation

**On Linux/Mac:**
```bash
# Simple copy
cp glou.db glou-backup-$(date +%Y%m%d-%H%M%S).db

# Or compress it
tar -czf glou-backup-$(date +%Y%m%d-%H%M%S).tar.gz glou.db

# Keep last 10 backups
ls -t glou-backup-*.db | tail -n +11 | xargs rm
```

**On Windows (PowerShell):**
```powershell
# Create backup with timestamp
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item glou.db "glou-backup-$timestamp.db"

# Keep last 10 backups
Get-ChildItem glou-backup-*.db | Sort-Object LastWriteTime -Descending | Select-Object -Skip 10 | Remove-Item
```

### Docker Installation

```bash
# Backup from running container
docker cp glou-container:/app/glou.db ./glou-backup-$(date +%Y%m%d-%H%M%S).db

# Or if using volumes
docker run --rm -v glou-data:/data -v $(pwd):/backup \
  alpine cp /data/glou.db /backup/glou-backup-$(date +%Y%m%d-%H%M%S).db
```

---

## 🔄 Automated Backups

### Daily Backup Script (Linux/Mac)

Create `backup.sh`:
```bash
#!/bin/bash

BACKUP_DIR="/path/to/backups"
DB_PATH="/path/to/glou-server/glou.db"
RETENTION_DAYS=30

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create backup
BACKUP_FILE="$BACKUP_DIR/glou-backup-$(date +%Y%m%d-%H%M%S).db"
cp "$DB_PATH" "$BACKUP_FILE"
gzip "$BACKUP_FILE"

# Keep backups for 30 days
find "$BACKUP_DIR" -name "glou-backup-*.db.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup created: $BACKUP_FILE.gz"
```

Add to crontab:
```bash
crontab -e

# Daily backup at 2:00 AM
0 2 * * * /path/to/backup.sh >> /var/log/glou-backup.log 2>&1
```

### Daily Backup Script (Windows - PowerShell)

Create `backup.ps1`:
```powershell
$BackupDir = "C:\backups\glou"
$DbPath = "C:\Users\Romain\Documents\_dev\glou-server\glou-server\glou.db"
$RetentionDays = 30

# Create backup directory
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

# Create backup
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupFile = Join-Path $BackupDir "glou-backup-$timestamp.db"
Copy-Item $DbPath $BackupFile

# Compress backup
Compress-Archive -Path $BackupFile -DestinationPath "$BackupFile.zip" -Force
Remove-Item $BackupFile

# Cleanup old backups
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem "$BackupDir\glou-backup-*.db.zip" | Where-Object { $_.LastWriteTime -lt $cutoff } | Remove-Item

Write-Host "Backup created: $BackupFile.zip"
```

Schedule with Task Scheduler:
```powershell
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File C:\backup.ps1"
$Trigger = New-ScheduledTaskTrigger -Daily -At 02:00
Register-ScheduledTask -Action $Action -Trigger $Trigger -TaskName "Glou Daily Backup"
```

---

## 📤 Full Data Export (for manual backup)

Glou provides API endpoints to export data without database access:

### Export as JSON (full backup)
```bash
curl -X GET http://localhost:8080/api/export/json \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o glou-export.json
```

Result: Complete data in JSON format (caves, wines, tastings, alerts)

### Export as CSV (spreadsheet-ready)

**Wines:**
```bash
curl -X GET http://localhost:8080/api/export/wines-csv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o wines.csv
```

**Caves:**
```bash
curl -X GET http://localhost:8080/api/export/caves-csv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o caves.csv
```

**Tasting History:**
```bash
curl -X GET http://localhost:8080/api/export/tasting-history-csv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o tastings.csv
```

---

## 🔙 Restore from Backup

### Full Database Restore

**Stop Glou first:**
```bash
# Docker
docker-compose down

# Or if running locally
pkill -f "go run cmd/api/main.go"
```

**Restore the database:**
```bash
# From backup
cp glou-backup-20250101-120000.db glou.db

# If compressed
gunzip glou-backup-20250101-120000.db.gz
mv glou-backup-20250101-120000.db glou.db
```

**Start Glou:**
```bash
# Docker
docker-compose up -d

# Or locally
go run cmd/api/main.go
```

### Restore from JSON Export

If you have a `glou-export.json` file (from API export):

```bash
curl -X POST http://localhost:8080/api/import/json \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @glou-export.json
```

**Note:** This appends/merges data. It does NOT delete existing records.

---

## 🚨 Disaster Recovery Checklist

### If Glou crashes:

1. **Database integrity check:**
   ```bash
   sqlite3 glou.db "PRAGMA integrity_check;"
   ```

2. **Restore from latest backup:**
   ```bash
   cp glou-backup-latest.db glou.db
   sqlite3 glou.db "PRAGMA integrity_check;"
   ```

3. **Restart Glou:**
   ```bash
   docker-compose up -d
   # or go run cmd/api/main.go
   ```

### If the database file is corrupted:

1. Copy the backup over:
   ```bash
   cp glou-backup-latest.db glou.db
   ```

2. If all backups are corrupted, restore from a remote backup service (see below)

---

## ☁️ Remote Backup (Cloud Storage)

### Backup to AWS S3

```bash
#!/bin/bash
BACKUP_FILE="glou-backup-$(date +%Y%m%d-%H%M%S).db.gz"
gzip -c glou.db > "$BACKUP_FILE"

aws s3 cp "$BACKUP_FILE" s3://your-bucket/glou-backups/
rm "$BACKUP_FILE"
```

### Backup to Google Drive (using rclone)

```bash
# Configure rclone
rclone config

# Create backup
tar -czf glou-backup.tar.gz glou.db

# Upload to Google Drive
rclone copy glou-backup.tar.gz gdrive:/Glou-Backups/

# Keep backup local
rm glou-backup.tar.gz
```

### Backup to Azure Blob Storage

```bash
#!/bin/bash
BACKUP_FILE="glou-backup-$(date +%Y%m%d-%H%M%S).db.gz"
gzip -c glou.db > "$BACKUP_FILE"

az storage blob upload \
  --account-name myaccount \
  --container-name glou-backups \
  --file "$BACKUP_FILE" \
  --name "$BACKUP_FILE"

rm "$BACKUP_FILE"
```

---

## 🔍 Activity Log

Glou maintains an activity log of all changes:

```bash
# View all activity logs
curl http://localhost:8080/api/admin/activity-log \
  -H "Authorization: Bearer YOUR_TOKEN"

# View logs for specific wine
curl http://localhost:8080/api/admin/activity-log/wine/123 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Filter by entity type
curl "http://localhost:8080/api/admin/activity-log?entity_type=wine&limit=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📋 Best Practices

✅ **Do:**
- Backup at least daily
- Test restores monthly
- Keep backups in at least 2 locations (local + remote)
- Monitor backup success (log the output)
- Document your backup process
- Keep versioned backups (3-4 weeks of history)

❌ **Don't:**
- Store backups only on the same server
- Forget to test restore procedures
- Keep backups unencrypted in cloud storage
- Leave old backups uncompressed (waste of space)
- Skip backups because "it's just wine data"

---

## 🆘 Support

If you encounter issues with backup/restore:
1. Check database integrity: `sqlite3 glou.db "PRAGMA integrity_check;"`
2. Review activity logs: `/api/admin/activity-log`
3. Check file permissions on backup directory
4. Ensure adequate disk space before backup

For more help: [GitHub Issues](https://github.com/jackthomasanderson/glou-server/issues)
