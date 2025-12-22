# 🍷 Glou - Quick Start Guide

Professional wine cellar management application with a modern web interface.

## 📋 Prerequisites

1. **Go 1.24+** - For the backend server
2. **Node.js 18+** - For the React interface (download from https://nodejs.org/)

## 🚀 Installation in 3 Steps

### Step 1: Install Node.js

If you don't have Node.js installed:
1. Download it from https://nodejs.org/ (LTS version recommended)
2. Install with default options
3. Restart your terminal
4. Verify: `node --version` and `npm --version`

### Step 2: Automatic Build

Use the provided PowerShell script:

```powershell
.\build-and-run.ps1
```

This script will automatically:
- ✓ Check Node.js
- ✓ Install npm dependencies
- ✓ Build the React application
- ✓ Compile the Go server
- ✓ Offer to start the server

### Step 3: Access the Application

Open your browser at: **http://localhost:8080**

## 🔧 Manual Build (if necessary)

If you prefer to perform the steps manually:

```powershell
# 1. Install npm dependencies
cd web
npm install

# 2. Build the React application
npm run build

# 3. Return to root and compile Go
cd ..
go build ./cmd/api

# 4. Start the server
.\api.exe
```

## 📱 Application URLs

Once the server is started, the application supports clean URLs:

- **/** → Main Dashboard
- **/dashboard** → Dashboard
- **/analytics** → Analytics and heatmap
- **/wines** → Wine list
- **/wines/create** → Add a wine
- **/cave** → Cellar management
- **/alerts** → Stock/apogee alerts
- **/tasting-history** → Tasting history
- **/admin** → Administration

## 🛠️ Development

### Development Mode with Hot-Reload

To develop the interface with automatic reloading:

```powershell
# Terminal 1: Go Backend
go run ./cmd/api

# Terminal 2: React Frontend (with proxy to backend)
cd web
npm run dev
```

Then open http://localhost:3000 (the frontend proxies API requests to :8080)

### Quick Rebuild

After modifying React code:

```powershell
cd web
npm run build
```

After modifying Go code:

```powershell
go build ./cmd/api
```
