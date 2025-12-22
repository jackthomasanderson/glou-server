# Glou documentation index

This repository now provides separate root READMEs for English and French. Use one of the language-specific README files below.

- `README.en.md` — English
- `README.fr.md` — Français

The canonical documentation (quick start, user guide, security, development) lives in the `docs/` folder and is available in both languages where appropriate.

Examples:

- `docs/QUICK_START.md`
- `docs/COMMANDS_CHEATSHEET.md`
- `docs/USER_GUIDE.md` (EN)
- `docs/USER_GUIDE.fr.md` (FR)
- `docs/SECURITY.md`

---

## CI & Publication

- **CI workflows**: `CI and Release` builds and tests on PRs and tags, `docker.yml` builds/pushes images to GHCR on tag release.
- **Goreleaser**: configuration in `.goreleaser.yml` builds cross-platform binaries, Homebrew formula and Docker images.

Required secrets for automated publication (set in GitHub repo Settings → Secrets):

- `GITHUB_TOKEN` (provided automatically by Actions) — used by goreleaser and workflows.
- `GPG_PRIVATE_KEY` and `GPG_PASSPHRASE` (optional) — to sign releases and artifacts.
- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` — only for Android CI (see android README).

Quick release steps (local):

```bash
# bump version, tag and push
git tag v0.0.1
git push origin --tags

# locally run goreleaser to produce artifacts (install goreleaser first)
goreleaser release --rm-dist
```

Notes:
- Replace owner/repo in `.goreleaser.yml` if different from `romain/glou-server`.
- For Homebrew publishing goreleaser will create a `Formula` folder with a formula; configure a tap if you want automatic publishing to a dedicated Homebrew tap.
- Docker images are pushed to `ghcr.io/OWNER/REPO` by the `docker.yml` workflow on tag push.


---

## License

MIT

---

<a id="français" name="français"></a>
# 🍷 Glou - Gestion de Collection Simplifiée

**[English](#english)** | **Français**

Gérez votre collection de vins, spiritueux et bières sans effort. Suivez les bouteilles, savez quand les boire et recevez des alertes intelligentes—tout auto-hébergé et sécurisé.

**🚀 [Démarrage Rapide](docs/QUICK_START.md)** | **📖 [Commandes](docs/COMMANDS_CHEATSHEET.md)** | **📱 [App Android](https://github.com/jackthomasanderson/glou-android)** | **🔐 [Sécurité](docs/SECURITY.md)**

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

