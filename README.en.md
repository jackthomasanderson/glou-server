# 🍷 Glou - Smart Beverage Collection Management

[![Go Version](https://img.shields.io/github/go-mod/go-version/romain/glou-server)](https://go.dev/)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com/)
[![License](https://img.shields.io/github/license/romain/glou-server)](LICENSE)
[![Status](https://img.shields.io/badge/status-production--ready-success)](https://github.com/romain/glou-server)

**[English]** | **[Français](README.fr.md)**

Effortless, self-hosted, and secure management for your wine, spirits, and beer collection. Track your bottles, know exactly when they reach their peak, and receive smart alerts—all while keeping your data private.

**🚀 [Quick Start](docs/QUICK_START.md)** | **📖 [User Guide](docs/USER_GUIDE.md)** | **📱 [Android App](https://github.com/jackthomasanderson/glou-android)** | **🔐 [Security](docs/SECURITY.md)**

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

- [Quick Start Guide](docs/QUICK_START.md) - Detailed installation instructions.
- [User Guide](docs/USER_GUIDE.md) - How to use the heatmaps and manage your collection.
- [Commands Cheatsheet](docs/COMMANDS_CHEATSHEET.md) - CLI tools for user management and maintenance.
- [Security Overview](docs/SECURITY.md) - Details on how we protect your data.
- [Development Guide](docs/DEVELOPMENT.md) - How to contribute to Glou.

---

## 🤝 Contributing

Contributions are welcome! Whether it's a bug report, a new feature, or a translation, please feel free to open an issue or a pull request. See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for more details.

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

*Glou is built with ❤️ for wine enthusiasts who value their privacy.*


## Quick Start (2 minutes)

Option 1 — Local:

```bash
go build -o api ./cmd/api
./api
```
Open: http://localhost:8080/

Option 2 — Docker:

```bash
docker-compose up -d
```

## Status

Production Ready (v1.0.0)

## CI & Release

See `.github/workflows` and `.goreleaser.yml` for CI and release steps.

---

For more details, see the documentation in the `docs/` folder.