# 🍷 Glou Server

[![Go Version](https://img.shields.io/badge/Go-1.22-blue)](https://go.dev/)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-yellow)](https://github.com/jackthomasanderson/glou-server/releases)

**Repositories:** [Backend (Go)](https://github.com/jackthomasanderson/glou-server) · [Mobile (Android)](https://github.com/jackthomasanderson/glou-android)

Glou: Your personal cellar.

⚠️ **Project status: Alpha** — Interfaces and APIs may change, features are under active development, and breaking changes can occur.

**🚀 [English Documentation](docs/EN/README.md)** | **🇫🇷 [Documentation Française](docs/FR/README.md)**

---

## ✨ Why Glou?

In a world of cloud-only apps, **Glou** puts you back in control of your cellar data.

- 🏠 **Self-Hosted** - Your data stays on your hardware. No cloud tracking, no subscriptions.
- 🔐 **Privacy First** - Sensitive data is encrypted at rest (AES-256-GCM) and passwords use bcrypt.
- 📊 **Visual Insights** - Interactive heatmaps and charts to understand your collection's balance.
- 🔔 **Smart Alerts** - Automatic notifications via Gotify or Email when wines reach their "Apogee".
- 📱 **Mobile Ready** - A responsive web interface plus a native Android app for on-the-go access.
- ⚡ **Blazing Fast** - Built with Go and SQLite for instant response times and minimal resource usage.
- 🔍 **Data Enrichment** - Automatic wine data fetching via barcode scanning and external APIs.

---

## 🎯 Recent Update: "Personal & Family Collection" Pivot (v0.2.0)

**Glou has pivoted from a SaaS/Pro dashboard to an intimate Personal Collection app.**

### What's New?
- 🏠 **Rebranded Interface**: "Ma Cave" (My Collection) instead of Dashboard
- ⚡ **Quick Actions**: Camera, Barcode Scan, Manual Add - all on one screen
- 🔔 **Smart Insights**: Ready to Drink, Peak Alerts, Recent Tastings at a glance
- 🔐 **Discreet Admin**: Advanced Settings tucked away, focused on personal use
- 🌍 **Full i18n**: French/English throughout

### For Developers
- 📖 [Collection Pivot Summary](COLLECTION_PIVOT_SUMMARY.md) - Overview of changes
- 🧪 [Testing Plan](TESTING_COLLECTION_PIVOT.md) - Complete test checklist
- 📐 [Design Guidelines](GUIDELINES_COLLECTION_IDENTITY.md) - Maintain identity in future features
- 👨‍💻 [Developer Integration Guide](DEVELOPER_INTEGRATION_GUIDE.md) - How to work with the new codebase

### Backward Compatibility ✅
- All security features preserved (AES-256-GCM, JWT, RBAC)
- Backend routes unchanged
- Database schema compatible
- Docker deployments unaffected

---

## 🛠️ Key Features

| Feature | Description |
| :--- | :--- |
| 🗺️ **Interactive Heatmaps** | Visualize geographic distribution of your wines across French regions. |
| 📅 **Apogee Tracking** | Know exactly when a wine is ready to drink, and when it's past its prime. |
| 🔔 **Multi-channel Alerts** | Get notified via Gotify or SMTP for low stock or peak drinking windows. |
| 📦 **Inventory Management** | Track quantities, locations (cellars/bins), and purchase history. |
| 📝 **Tasting Notes** | Record your experiences with detailed ratings and personal notes. |
| 🔄 **Import/Export** | Full control over your data with CSV and JSON export options. |
| 🛡️ **Audit Logs** | Complete history of all changes made to your collection. |

---

## 🚀 Quick Start

### Docker (Recommended)
```bash
# Deploy with Docker Compose
docker compose -f docker-compose.prod.yml up -d
```

### Standalone Binary
Download the latest binary from [Releases](https://github.com/jackthomasanderson/glou-server/releases).

```bash
./glou-server      # Linux/Mac
glou-server.exe    # Windows
```

### Build from Source
Requires [Go 1.22+](https://go.dev/).

```bash
go build -o glou-server ./cmd/api
./glou-server
```

Access at **http://localhost:8080**

📚 **[Complete Setup Guide](docs/EN/QUICK_START.md)**

---

## 💻 Tech Stack

- **Backend**: [Go](https://go.dev/) with pure-Go [SQLite](https://modernc.org/sqlite) (no CGO)
- **Frontend**: [React](https://reactjs.org/), [Vite](https://vitejs.dev/), [Zustand](https://github.com/pmndrs/zustand), [Chart.js](https://www.chartjs.org/)
- **Security**: AES-256-GCM encryption, bcrypt password hashing
- **CI/CD**: GitHub Actions with [GoReleaser](https://goreleaser.com/)

---

## 📖 Documentation

### 🇬🇧 English
- [Quick Start Guide](docs/EN/QUICK_START.md)
- [User Guide](docs/EN/USER_GUIDE.md)
- [Commands Cheatsheet](docs/EN/COMMANDS_CHEATSHEET.md)
- [Security Overview](docs/EN/SECURITY.md)
- [Development Guide](docs/EN/DEVELOPMENT.md)

### 🇫🇷 Français
- [Guide de démarrage rapide](docs/FR/QUICK_START.md)
- [Guide Utilisateur](docs/FR/USER_GUIDE.md)
- [Aide-mémoire Commandes](docs/FR/COMMANDS_CHEATSHEET.md)
- [Sécurité](docs/FR/SECURITY.md)
- [Développement](docs/FR/DEVELOPMENT.md)

---

## 🤝 Contributing

Contributions are welcome! See [DEVELOPMENT.md](docs/EN/DEVELOPMENT.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

---

*Glou is built with ❤️ for wine enthusiasts who value their privacy.*

