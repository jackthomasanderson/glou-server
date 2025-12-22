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

Or force stop:
```powershell
Stop-Process -Name api
```
