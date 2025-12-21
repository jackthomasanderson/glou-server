# 🍷 Glou - Smart Beverage Collection Management

**English** | [Français](#français)

Manage your wine, spirit, and beer collection effortlessly. Track bottles, know when to drink them, and get smart alerts—all self-hosted and secure.

**🚀 [Quick Start](QUICK_START.md)** | **📖 [Commands](COMMANDS_CHEATSHEET.md)** | **📱 [Android App](https://github.com/jackthomasanderson/glou-android)** | **📚 [Documentation](documentation/)**

**Status:** ✅ Production Ready (v1.0.0) | Tests: ✅ Passing | Build: ✅ Successful

---

## ⚡ Quick Start (3 steps)

1. **Install Node.js** (if not installed): Download from https://nodejs.org/
2. **Run build script:**
   ```powershell
   .\build-and-run.ps1
   ```
3. **Open browser:** http://localhost:8080

📚 **Detailed instructions:** See [QUICK_START.md](QUICK_START.md)

---

## Why Glou?

- 🏠 **Self-hosted** - Your data stays on your server
- 📱 **Mobile-ready** - Web interface + native Android app
- 🔐 **Secure** - ANSSI-compliant encryption (AES-256-GCM), bcrypt passwords, secure transactions
- 🛡️ **Privacy-first** - Sensitive data encrypted at rest, RGPD-compliant
- 🌍 **Bilingual** - English & French, auto-detect language
- ⚡ **Fast** - No cloud delays, instant local access
- 🔔 **Smart Alerts** - Automatic notifications via Gotify or email when wines reach apogee
- 📊 **Full Export** - CSV, JSON backups - your data, always accessible
- 🔄 **Easy Migration** - Move servers without losing data
- 📝 **Activity Logging** - Complete audit trail of all changes
- 📱 **Barcode Scanning** - Auto-populate wine data from barcodes

---

## How It Works

```
1. Add your wines       → Track location, buy date, apogee window
2. Set apogee dates     → Min/max drinking window (auto-calculated)
3. Get smart alerts     → Notified 6 months before peak, when to drink now
4. Record tastings      → Journal entries with ratings & notes
5. View dashboard       → Statistics, capacity, next wines to drink
6. Export & backup      → CSV/JSON exports, full data control
```

---

## Getting Started (2 minutes)

### Option 1: Local (no Docker)
```bash
go build -o api ./cmd/api
./api
```
Then open: **http://localhost:8080/**

### Option 2: Docker
```bash
docker-compose up -d
```
Then open: **http://localhost:8080/**

### First Steps
1. Create a **Cave** (cellar) - your storage location
2. Add **Cells** (shelves/positions) to your cave
3. Add your first **Wine** - name, vintage, apogee dates
4. Check **Dashboard** - see your collection at a glance
5. Set **Alerts** - get notified when to drink

---

## Features at a Glance

| Feature | Description |
|---------|-------------|
| 🍾 **Wine Inventory** | Full tracking with vintage, location, apogee dates |
| 🗄️ **Multiple Cellars** | Organize wines across different storage areas |
| 📅 **Apogee Tracking** | Know exactly when each wine is at its best |
| 🔍 **Barcode Scanning** | Scan wine labels to auto-populate details |
| ⚡ **Auto-Enrichment** | Name search or barcode → auto-fill wine details |
| 🔔 **Smart Alerts** | Auto-alerts via Gotify or email, 6 months before peak, when wine is ready |
| 📔 **Tasting Journal** | Record consumption, ratings, tasting notes |
| 📊 **Dashboard** | Quick stats, capacity, next wines to drink |
| 💾 **Full Export** | CSV/JSON exports for backup and analysis |
| 🔄 **Easy Migration** | Move to new server with zero data loss |
| 📝 **Activity Log** | Complete audit trail of who changed what |
| 🌙 **Dark Mode** | Comfortable viewing day or night |
| 🇬🇧🇫🇷 **Bilingual** | Seamless English/French switching |

---

## Documentation

- **For Users:** [FAQ](docs/EN/02-user/FAQ.md), [Wine Enrichment](docs/EN/05-enrichment/ENRICHMENT.md), [Notifications Setup](docs/EN/02-user/NOTIFICATIONS_SETUP.md), [Barcode Guide](docs/EN/05-enrichment/BARCODE_GUIDE.md)
- **For Admins:** [Admin Panel Guide](docs/EN/06-legacy/ADMIN_GUIDE.md) - Configure domain, branding, colors, reverse proxy. **[Backup & Restore](docs/EN/03-admin/BACKUP_RESTORE_GUIDE.md)** - Complete backup strategies. **[Data Migration](docs/EN/03-admin/DATA_MIGRATION_GUIDE.md)** - Move servers easily.
- **Security:** **[🔐 ANSSI Security Guide](SECURITE_ANSSI.md)** - Complete security documentation. **[Encryption Guide](CHIFFREMENT.md)** - Data encryption implementation.
- **For Developers:** Full documentation in `.docs/` folder
- **API Users:** **[Complete API Reference with Examples](docs/EN/04-api/API_REFERENCE_COMPLETE.md)** - All endpoints + curl examples

---

## Status

✅ **Production Ready** (v1.0.0)  
✅ Full-featured wine management  
✅ 30+ REST API endpoints  
✅ Secure & optimized with validation layer  
✅ Data export/import (CSV, JSON)  
✅ Activity logging & audit trail  
✅ Barcode scanning support  
✅ Thread-safe background services (AlertGenerator)  
✅ Atomic database transactions  
✅ **All critical fixes implemented and tested** (see [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md))  

---

## License

MIT

---

# 🍷 Glou - Gestion de Collection Simplifiée

**English** (au-dessus) | **Français**

Gérez votre collection de vins, spiritueux et bières sans effort. Suivez les bouteilles, savez quand les boire et recevez des alertes intelligentes—tout auto-hébergé et sécurisé.

**Compagnon:** [App Android](https://github.com/jackthomasanderson/glou-android) · [Docs](docs/)

**Status:** ✅ Prêt Production (v1.0.0) | Tests: ✅ Validés | Build: ✅ Succès

---

### Pourquoi Glou?

- 🏠 **Auto-hébergé** - Vos données restent sur votre serveur
- 📱 **Mobile-prêt** - Interface web + app Android native
- 🔐 **Sécurisé** - Chiffrement conforme ANSSI (AES-256-GCM), mots de passe bcrypt
- 🛡️ **Confidentialité** - Données sensibles chiffrées au repos, conforme RGPD
- 🌍 **Bilingue** - Anglais & Français, auto-détecte
- ⚡ **Rapide** - Pas de nuage, accès local instantané
- 🔔 **Alertes Intelligentes** - Notifications automatiques via Gotify ou email
- 📊 **Export Complet** - CSV, JSON pour sauvegarde
- 🔄 **Migration Facile** - Changez de serveur sans perte
- 📝 **Audit Complet** - Historique complet des modifications
- 📱 **Scan Code-barres** - Remplissage automatique des données vin

---

### Démarrage Rapide (2 minutes)

#### Option 1: Local
```bash
go build -o api ./cmd/api
./api
```
Puis ouvrir: **http://localhost:8080/**

#### Option 2: Docker
```bash
docker-compose up -d
```
Puis ouvrir: **http://localhost:8080/**

#### Premiers pas
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

- **Utilisateurs:** [FAQ](docs/FR/02-user/FAQ.md), [Enrichissement Vins](docs/FR/05-enrichment/ENRICHMENT.md), [Notifications](docs/FR/02-user/NOTIFICATIONS_SETUP.md), [Codes-barres](docs/FR/05-enrichment/BARCODE_GUIDE.md)
- **Administrateurs:** [Guide Admin](docs/FR/06-legacy/ADMIN_GUIDE.md) - Domaine, marque, couleurs, reverse proxy. **[Sauvegarde & Restauration](docs/FR/03-admin/BACKUP_RESTORE_GUIDE.md)**. **[Migration de Données](docs/FR/03-admin/DATA_MIGRATION_GUIDE.md)**
- **Développeurs:** Documentation complète dans `.docs/`
- **API:** [Référence API Complète](docs/FR/04-api/API_REFERENCE_COMPLETE.md) avec exemples curl

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
✅ **Tous les bugs critiques fixés et testés** (voir [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md))
