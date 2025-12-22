# 🍷 Glou - Smart Beverage Collection Management

Effortless, self-hosted, and secure management for your wine, spirits, and beer collection. Track your bottles, know exactly when they reach their peak, and receive smart alerts—all while keeping your data private.

**[English]** | **[Français](../FR/README.md)**

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

## 📖 Documentation

- [Quick Start Guide](QUICK_START.md)
- [User Guide](USER_GUIDE.md)
- [Web Application Guide](WEB_README.md)
- [Commands Cheatsheet](COMMANDS_CHEATSHEET.md)
- [Security Overview](SECURITY.md)
- [Development Guide](DEVELOPMENT.md)

---

## 🚀 Quick Start (2 minutes)

### Option 1: Docker (Recommended)
```bash
docker-compose up -d
```

### Option 2: Local Development
```bash
go build -o api ./cmd/api
./api
```

---

## 🤝 Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for more details.

## 📄 License

This project is licensed under the **MIT License** - see the [../../LICENSE](../../LICENSE) file for details.
