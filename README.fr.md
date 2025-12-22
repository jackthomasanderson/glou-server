# 🍷 Glou - Gestion de Collection Simplifiée

[![Version Go](https://img.shields.io/github/go-mod/go-version/romain/glou-server)](https://go.dev/)
[![Docker](https://img.shields.io/badge/docker-prêt-blue.svg)](https://www.docker.com/)
[![Licence](https://img.shields.io/github/license/romain/glou-server)](LICENSE)
[![Statut](https://img.shields.io/badge/statut-prêt--production-success)](https://github.com/romain/glou-server)

**[English](README.md)** | **[Français]**

Gérez votre collection de vins, spiritueux et bières sans effort. Suivez vos bouteilles, sachez exactement quand les boire et recevez des alertes intelligentes — le tout auto-hébergé et sécurisé.

**🚀 [Démarrage Rapide](docs/QUICK_START.md)** | **📖 [Guide Utilisateur](docs/USER_GUIDE.fr.md)** | **📱 [App Android](https://github.com/jackthomasanderson/glou-android)** | **🔐 [Sécurité](docs/SECURITY.md)**

---

## ✨ Pourquoi Glou ?

Dans un monde d'applications 100% cloud, **Glou** vous redonne le contrôle sur les données de votre cave.

- 🏠 **Auto-hébergé** - Vos données restent sur votre matériel. Pas de suivi cloud, pas d'abonnement.
- 🔐 **Sécurité Maximale** - Données sensibles chiffrées au repos (AES-256-GCM) et mots de passe hachés avec bcrypt.
- 📊 **Visualisations** - Cartes de chaleur (heatmaps) et graphiques interactifs pour comprendre l'équilibre de votre collection.
- 🔔 **Alertes Intelligentes** - Notifications automatiques via Gotify ou Email quand vos vins atteignent leur "Apogée".
- 📱 **Mobile-Ready** - Une interface web responsive et une application Android native pour un accès partout.
- ⚡ **Ultra Rapide** - Développé en Go avec SQLite pour des temps de réponse instantanés et une consommation minimale.
- 🔍 **Enrichissement de Données** - Récupération automatique des infos via scan de code-barres et APIs externes.

---

## 🛠️ Fonctionnalités Clés

| Fonctionnalité | Description |
| :--- | :--- |
| 🗺️ **Heatmaps Interactives** | Visualisez la distribution géographique de vos vins par région française. |
| 📅 **Suivi de l'Apogée** | Sachez exactement quand un vin est prêt à boire ou s'il est temps de le déboucher. |
| 🔔 **Alertes Multi-canaux** | Notifications via Gotify ou SMTP pour les stocks bas ou les fenêtres de dégustation. |
| 📦 **Gestion d'Inventaire** | Suivez les quantités, les emplacements (caves/casiers) et l'historique d'achat. |
| 📝 **Notes de Dégustation** | Enregistrez vos expériences avec des notes détaillées et des évaluations personnelles. |
| 🔄 **Import/Export** | Gardez le contrôle total avec des options d'exportation CSV et JSON. |
| 🛡️ **Journaux d'Audit** | Historique complet de toutes les modifications apportées à votre collection. |

---

## 🚀 Démarrage Rapide (2 minutes)

### Option 1 : Docker (Recommandé)
La méthode la plus simple pour lancer Glou est d'utiliser Docker Compose.

```bash
docker-compose up -d
```
Accédez à l'interface web sur **http://localhost:8080**.

### Option 2 : Installation Locale
Assurez-vous d'avoir [Go 1.24+](https://go.dev/) installé.

```bash
# Compiler l'API
go build -o api ./cmd/api

# Lancer le serveur
./api
```

---

## 💻 Stack Technique

- **Backend** : [Go](https://go.dev/) (Golang) avec un pilote [SQLite](https://modernc.org/sqlite) pur Go (pas de CGO requis).
- **Frontend** : [React](https://reactjs.org/), [Vite](https://vitejs.dev/), [Zustand](https://github.com/pmndrs/zustand) pour la gestion d'état, et [Chart.js](https://www.chartjs.org/) pour les graphiques.
- **Sécurité** : Chiffrement AES-256-GCM pour les champs sensibles, bcrypt pour les mots de passe.
- **CI/CD** : GitHub Actions avec [GoReleaser](https://goreleaser.com/) pour les builds multi-plateformes.

---

## 📖 Documentation

- [Démarrage Rapide](docs/QUICK_START.md) - Instructions d'installation détaillées.
- [Guide Utilisateur](docs/USER_GUIDE.fr.md) - Comment utiliser les heatmaps et gérer votre collection.
- [Aide-mémoire Commandes](docs/COMMANDS_CHEATSHEET.md) - Outils CLI pour la gestion des utilisateurs.
- [Sécurité](docs/SECURITY.md) - Détails sur la protection de vos données.
- [Guide de Développement](docs/DEVELOPMENT.md) - Comment contribuer à Glou.

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Qu'il s'agisse d'un rapport de bug, d'une nouvelle fonctionnalité ou d'une traduction, n'hésitez pas à ouvrir une issue ou une pull request. Voir [DEVELOPMENT.md](docs/DEVELOPMENT.md) pour plus de détails.

## 📄 Licence

Ce projet est sous licence **MIT** - voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

*Glou est développé avec ❤️ pour les passionnés de vin qui tiennent à leur vie privée.*


## Démarrage rapide (2 minutes)

Option 1 — Local :

```bash
go build -o api ./cmd/api
./api
```
Ouvrez : http://localhost:8080/

Option 2 — Docker :

```bash
docker-compose up -d
```

## Statut

Prêt pour la production (v1.0.0)

---

Pour plus de détails, consultez le dossier `docs/`.