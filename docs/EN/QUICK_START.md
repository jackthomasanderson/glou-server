# 🍷 Glou - Quick Start Guide

Professional wine cellar management application with a modern web interface.

## 📋 Prerequisites

1. **Go 1.23+** - For the backend server
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

## 📚 Documentation

- [English README](README.md)
- [French README](../FR/README.md)
- [Web Application Guide](WEB_README.md) - Details on the React application

## 🎨 Architecture

```
glou-server/
├── cmd/api/              # Go HTTP Server
├── internal/             # Internal Go code
│   ├── domain/          # Data models
│   ├── store/           # SQLite database
│   ├── enricher/        # External APIs
│   └── notifier/        # Notifications
├── web/                  # React Application
│   ├── src/             # React source code
│   ├── dist/            # Production build (generated)
│   └── index.html       # Entry point
└── assets/               # Legacy HTML (obsolete)
```

## ⚙️ Configuration

The server uses optional environment variables:

```bash
PORT=8080                    # Server port (default: 8080)
DB_PATH=./glou.db           # Database path
ENVIRONMENT=development      # development or production
ALLOWED_ORIGINS=*           # CORS origins
```

## 🔄 Update

To update the application:

```powershell
# Update Go dependencies
go get -u ./...
go mod tidy

# Update npm dependencies
cd web
npm update

# Rebuild
cd ..
.\build-and-run.ps1
```

## 🐛 Troubleshooting

### "npm is not recognized"
→ Node.js is not installed or not in the PATH. Install Node.js and restart the terminal.

### "Cannot GET /"
→ The React application has not been built. Run `cd web && npm run build`

### Port 8080 already in use
→ Change the port with the environment variable: `$env:PORT=8081; .\api.exe`

### CORS Error
→ Ensure you are accessing via http://localhost:8080 and not another origin.

## 📞 Support

For more information:

- Check the release notes in the repository (Releases)
- Read the [User Guide](USER_GUIDE.md)

## 🎯 Key Features

- ✅ Complete wine cellar management
- ✅ Bottle tracking with exact position
- ✅ Visual heatmap of wine regions
- ✅ Low stock and apogee alerts
- ✅ Tasting history with notes
- ✅ Automatic enrichment via external APIs
- ✅ JSON and CSV Export/Import
- ✅ Adaptive Material Design 3 interface (mobile/tablet/desktop)
- ✅ Dark/Light mode
- ✅ Full REST API
- ✅ Integrated SQLite database

```powershell
go build ./cmd/api
```
