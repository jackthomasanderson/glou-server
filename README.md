# 🍷 Glou - Wine Management Made Simple

**English** | [Français](#français)

Manage your wine collection effortlessly. Track bottles, know when to drink them, and get smart alerts—all self-hosted and secure.

**Companion:** [Android App](https://github.com/jackthomasanderson/glou-android) · [Docs](.docs/)

---

## Why Glou?

- 🏠 **Self-hosted** - Your data stays on your server
- 📱 **Mobile-ready** - Web interface + native Android app
- 🔐 **Secure** - Production-grade security built-in
- 🌍 **Bilingual** - English & French, auto-detect language
- ⚡ **Fast** - No cloud delays, instant local access
- 🔔 **Smart Alerts** - Notifications via Gotify or email when wines reach apogee
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

- **For Users:** [FAQ](.docs/FAQ.md), [Wine Enrichment](.docs/ENRICHMENT.md), [Notifications Setup](.docs/NOTIFICATIONS_SETUP.md), [Barcode Guide](.docs/BARCODE_GUIDE.md)
- **For Admins:** [Admin Panel Guide](.docs/ADMIN_GUIDE.md) - Configure domain, branding, colors, reverse proxy. **[Backup & Restore](.docs/BACKUP_RESTORE_GUIDE.md)** - Complete backup strategies. **[Data Migration](.docs/DATA_MIGRATION_GUIDE.md)** - Move servers easily.
- **For Developers:** Full documentation in `.docs/` folder
- **API Users:** **[Complete API Reference with Examples](.docs/API_REFERENCE_COMPLETE.md)** - All endpoints + curl examples

---

## Status

✅ **Production Ready** (v1.0.0)  
✅ Full-featured wine management  
✅ 30+ REST API endpoints  
✅ Secure & optimized  
✅ Data export/import (CSV, JSON)  
✅ Activity logging & audit trail  
✅ Barcode scanning support  

---

## License

MIT

---

# 🍷 Glou - Gestion de Cave Simplifiée

## Français

Gérez votre collection de vins sans effort. Suivez les bouteilles, savez quand les boire et recevez des alertes intelligentes—tout auto-hébergé et sécurisé.

**Compagnon:** [App Android](https://github.com/jackthomasanderson/glou-android) · [Docs](.docs/)

---

### Pourquoi Glou?

- 🏠 **Auto-hébergé** - Vos données restent sur votre serveur
- 📱 **Mobile-prêt** - Interface web + app Android native
- 🔐 **Sécurisé** - Sécurité production intégrée
- 🌍 **Bilingue** - Anglais & Français, auto-détecte
- ⚡ **Rapide** - Pas de nuage, accès local instantané
- 🔔 **Alertes Intelligentes** - Notifications via Gotify ou email quand l'apogée est atteinte

---

### Ça Marche Comment?

```
1. Ajoutez vos vins      → Lieu, date achat, fenêtre apogée
2. Définissez apogée     → Min/max à boire (auto-calculé)
3. Recevez alertes       → Notifié 6 mois avant pic, quand le boire
4. Enregistrez dégust.   → Notes avec notes de dégustation
5. Voyez le tableau de b.→ Stats, capacité, prochains à boire
```

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
1. Créez une **Cave** - votre lieu de stockage
2. Ajoutez des **Cellules** (étagères) à votre cave
3. Ajoutez votre premier **Vin** - nom, millésime, dates apogée
4. Consultez le **Tableau de bord** - votre collection en un coup d'œil
5. Paramétrez les **Alertes** - soyez notifié quand le boire

---

### Fonctionnalités Principales

| Fonctionnalité | Description |
|---|---|
| 🍾 **Inventaire Vins** | Suivi complet avec millésime, lieu, dates apogée |
| 🗄️ **Multiples Caves** | Organisez les vins dans différents lieux |
| 📅 **Suivi Apogée** | Savez précisément quand chaque vin est au meilleur |
| 🔔 **Alertes Intelligentes** | Auto-alertes via Gotify ou mail, 6 mois avant pic, quand prêt |
| 📔 **Journal Dégustation** | Enregistrez conso, notes, impressions |
| 📊 **Tableau de Bord** | Stats rapides, capacité, prochains à boire |
| 🌙 **Mode Sombre** | Visualisation confortable jour et nuit |
| 🇬🇧🇫🇷 **Bilingue** | Bascule fluide Anglais/Français |

---

### Documentation

- **Pour Utilisateurs:** [FAQ](.docs/FAQ.md), [Configuration Notifications](.docs/NOTIFICATIONS_SETUP.md), Guide de démarrage
- **Pour Admins:** [Guide Admin](.docs/ADMIN_GUIDE.md) - Configurez domaine, marque, couleurs, reverse proxy
- **Pour Développeurs:** Documentation complète dans `.docs/`
- **API Users:** [Référence API](.docs/API_REFERENCE.md)

---

### Status

✅ **Prêt Production** (v1.0.0)  
✅ Gestion de cave complète  
✅ 25+ endpoints API REST  
✅ Sécurisé & optimisé

---

### Licence

MIT

---

## 🛠 For Developers

### Tech Stack

- **Backend:** Go 1.24
- **Frontend:** HTML5 + Vanilla JS + CSS3
- **Database:** SQLite (pure Go)
- **i18n:** JSON-based translations
- **Deployment:** Docker + Nginx

### Project Structure

```
glou-server/
├── cmd/api/           # Server & HTTP handlers
├── internal/
│   ├── domain/        # Business logic & models
│   └── store/         # SQLite persistence
├── assets/            # Web UI & translations
└── .docs/             # Full documentation
```

### API

30+ endpoints for wine, cave, alert, and journal management.  
See [Complete API Reference](.docs/API_REFERENCE_COMPLETE.md) with curl examples.

### Contributing

See `.docs/BEST_PRACTICES.md` and `.docs/COMMIT_CHECKLIST.md`.

---

## Français

**Gestion de cave à vin complète** - Auto-hébergée, sécurisée, prête pour la production.

Suivi complet des vins avec alertes intelligentes, historique de dégustation, exports CSV/JSON, migration facile.

### Démarrage Rapide

```bash
# Build
go build -o api ./cmd/api

# Lancer
./api

# Ouvrir: http://localhost:8080/
```

Ou avec Docker:
```bash
docker-compose up -d
# Ouvrir: http://localhost:8080/
```

### Fonctionnalités

✅ Gestion d'inventaire de vins complet  
✅ Multiples caves avec suivi de capacité  
✅ Suivi des dates d'apogée  
✅ Alertes intelligentes (Gotify, email)  
✅ Journal de dégustation avec notes & notation  
✅ Tableau de bord & statistiques  
✅ **Scan de code-barres** pour remplissage auto  
✅ **Export complet** (CSV, JSON) pour backup  
✅ **Migration facile** entre serveurs  
✅ **Historique d'activité** complet (audit trail)  
✅ Mode sombre  
✅ Interface bilingue (FR/EN)  

### Documentation

- **Utilisateurs:** [FAQ](.docs/FAQ.md), [Guide Enrichissement](.docs/ENRICHMENT.md), [Configuration Notifications](.docs/NOTIFICATIONS_SETUP.md)
- **Administrateurs:** [Guide Admin](.docs/ADMIN_GUIDE.md), **[Sauvegarde & Restauration](.docs/BACKUP_RESTORE_GUIDE.md)**, **[Migration de Données](.docs/DATA_MIGRATION_GUIDE.md)**
- **Développeurs:** [Référence API Complète](.docs/API_REFERENCE_COMPLETE.md) avec exemples curl  
✅ Mode sombre  
✅ Interface bilingue  
✅ Sécurité production  

### Documentation

Voir `.docs/` pour la documentation complète (locale, non commitée).

### Status

✅ **Prêt pour la production** (v1.0.0)
