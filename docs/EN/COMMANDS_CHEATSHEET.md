# 🚀 Essential Commands - Glou

## ⚡ Quick Start (Recommended)

```powershell
.\build-and-run.ps1
```

This single command does everything automatically.

---

## 📦 Initial Installation (One-time)

### 1. Install Node.js
Download from: https://nodejs.org/
Recommended version: **LTS (Long Term Support)**

### 2. Install Dependencies
```powershell
cd web
npm install
cd ..
```

---

## 🔨 Full Build

### Option A: Automatic Script
```powershell
.\build-and-run.ps1
```

### Option B: Manual Steps
```powershell
# 1. Build React
cd web
npm run build
cd ..

# 2. Build Go
go build ./cmd/api

# 3. Start
.\api.exe
```

---

## 🎯 Accessing the Application

**Main URL:** http://localhost:8080

**Available URLs:**
- `/dashboard` - Dashboard
- `/wines` - Wine list
- `/cave` - Cellar management
- `/alerts` - Alerts
- `/analytics` - Analytics

---

## 🔧 Development

### Development Mode with Hot-Reload

**Terminal 1 - Backend:**
```powershell
go run ./cmd/api
```

**Terminal 2 - Frontend:**
```powershell
cd web
npm run dev
```

Then open http://localhost:3000

### Quick Rebuild after Modification

**Frontend only:**
```powershell
cd web
npm run build
```

**Backend only:**
```powershell
go build ./cmd/api
```

---

## 🛑 Stop the Server

**Ctrl+C** in the terminal where `api.exe` is running.

```powershell
Stop-Process -Name api -Force
```

---

## 🔄 Quick Restart

```powershell
Stop-Process -Name api -Force -ErrorAction SilentlyContinue
.\api.exe
```

---

## 📊 Useful Commands

### Check Versions
```powershell
node --version
npm --version
go version
```

### Clean and Full Rebuild
```powershell
# Clean React build
cd web
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npm run build
cd ..

# Clean and rebuild Go
Remove-Item api.exe -ErrorAction SilentlyContinue
go build ./cmd/api
```

### Reset Database
```powershell
Stop-Process -Name api -Force -ErrorAction SilentlyContinue
Remove-Item glou.db -ErrorAction SilentlyContinue
.\api.exe
```

### Update Dependencies
```powershell
# Go dependencies
go get -u ./...
go mod tidy

# npm dependencies
cd web
npm update
cd ..
```

---

## ❌ Troubleshooting

### Problem: "npm is not recognized"
**Solution:** Install Node.js and restart the terminal.

### Problem: Port 8080 already in use
**Solution:** Change the port.
```powershell
$env:PORT=8081
.\api.exe
```

### Problem: React build error
**Solution:** Clean and reinstall.
```powershell
cd web
Remove-Item -Recurse -Force node_modules, dist
npm install
npm run build
cd ..
```

### Problem: "Cannot GET /dashboard"
**Solution:** The React app is not built.
```powershell
cd web
npm run build
cd ..
go build ./cmd/api
.\api.exe
```

### Problem: Changes not visible
**Solution:** Clear browser cache with **Ctrl+Shift+R**.

---

## 📁 Generated File Structure

```
glou-server/
├── api.exe              ← Compiled server
├── glou.db              ← SQLite database
└── web/
    ├── node_modules/    ← npm dependencies (do not commit)
    └── dist/            ← React build (do not commit)
        ├── index.html
        └── assets/
            ├── index-[hash].js
            └── index-[hash].css
```

---

## 🎓 Typical Workflow

### First Installation
```powershell
.\build-and-run.ps1
```

### Daily Development
```powershell
# Terminal 1
go run ./cmd/api

# Terminal 2
cd web
npm run dev
# Access http://localhost:3000
```

### Before Git Commit
```powershell
# Production rebuild
cd web
npm run build
cd ..
go build ./cmd/api

# Final test
.\api.exe
# Check http://localhost:8080
```

### Deployment
```powershell
# Optimized build
.\build-and-run.ps1

# Copy these files to the server:
# - api.exe
# - web/dist/ (entire folder)
# - glou.db (if migrating data)
```

---

## 📚 Documentation

- [English README](README.md)
- [French README](../FR/README.md)

---

**💡 Tip:** Bookmark this page for quick access!
```powershell
Stop-Process -Name api
```
