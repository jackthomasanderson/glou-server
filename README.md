# 🍷 Glou - Smart Beverage Collection Management

[![Go Version](https://img.shields.io/github/go-mod/go-version/romain/glou-server)](https://go.dev/)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com/)
[![License](https://img.shields.io/github/license/romain/glou-server)](LICENSE)
[![Status](https://img.shields.io/badge/status-production--ready-success)](https://github.com/romain/glou-server)

Effortless, self-hosted, and secure management for your wine, spirits, and beer collection. Track your bottles, know exactly when they reach their peak, and receive smart alerts—all while keeping your data private.

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

## 🚀 Quick Start (2 minutes)

### Option 1: Docker (Recommended)
The easiest way to get Glou running is with Docker Compose.

```bash
docker-compose up -d
```
Access the web interface at **http://localhost:8080**.

### Option 2: Local Development
Ensure you have [Go 1.24+](https://go.dev/) installed.

```bash
# Build the API
go build -o api ./cmd/api

# Run the server
./api
```

---

## 💻 Tech Stack

- **Backend**: [Go](https://go.dev/) (Golang) with a pure-Go [SQLite](https://modernc.org/sqlite) driver (no CGO required).
- **Frontend**: [React](https://reactjs.org/), [Vite](https://vitejs.dev/), [Zustand](https://github.com/pmndrs/zustand) for state management, and [Chart.js](https://www.chartjs.org/) for visualizations.
- **Security**: AES-256-GCM encryption for sensitive fields, bcrypt for password hashing.
- **CI/CD**: GitHub Actions with [GoReleaser](https://goreleaser.com/) for cross-platform builds.

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

Contributions are welcome! Whether it's a bug report, a new feature, or a translation, please feel free to open an issue or a pull request. See [DEVELOPMENT.md](docs/EN/DEVELOPMENT.md) for more details.

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

*Glou is built with ❤️ for wine enthusiasts who value their privacy.*
1. Créez une **Collection** - votre lieu de stockage
2. Ajoutez des **Cellules** (étagères) à votre collection
3. Ajoutez votre première **Bouteille** - nom, millésime, dates apogée
4. Consultez le **Tableau de bord** - votre collection d'un coup d'œil
5. Paramétrez les **Alertes** - soyez notifié au moment de boire

---

### Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🍾 **Inventaire Vins** | Suivi complet avec millésime, lieu, dates apogée |
| 📄 **Multiples Collections** | Organisez les boissons dans différents lieux |
| 📅 **Suivi Apogée** | Savez précisément quand chaque vin est au meilleur |
| 🔍 **Recherche & Filtres** | Trouvez vos vins rapidement |
| 🔔 **Alertes Intelligentes** | Notifications automatiques 6 mois avant pic |
| 📔 **Journal Dégustation** | Enregistrez conso, notes, impressions |
| 📊 **Tableau de Bord** | Stats rapides, capacité, prochains à boire |
| 💾 **Export Complet** | CSV/JSON pour backup et analyse |
| 🔄 **Migration Facile** | Zéro perte de données |
| 📝 **Audit Trail** | Qui a changé quoi, quand |
| 🌙 **Mode Sombre** | Visualisation confortable jour et nuit |
| 🇬🇧🇫🇷 **Bilingue** | Bascule fluide FR/EN |

---

### Documentation

- **[🚀 Démarrage Rapide](docs/QUICK_START.md)**
- **[📖 Aide-mémoire Commandes](docs/COMMANDS_CHEATSHEET.md)**
- **[🔐 Sécurité & Chiffrement](docs/SECURITY.md)**
- **[🛠️ Guide de Développement](docs/DEVELOPMENT.md)**
- **[📊 Guide Utilisateur](docs/USER_GUIDE.md)**

---

### Status

✅ **Prêt Production** (v1.0.0)  
✅ Gestion collection complète  
✅ 30+ endpoints API REST  
✅ Sécurisé & optimisé avec validation  
✅ Exports CSV/JSON  
✅ Historique complet & audit trail  
✅ Services thread-safe (AlertGenerator)  
✅ Transactions atomiques  

