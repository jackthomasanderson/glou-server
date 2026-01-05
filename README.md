# Glou — Gestion Privée de Cave à Vin et Spiritueux

Une application moderne et complète pour gérer sa collection privée de vin, champagne, spiritueux et cigares avec une interface élégante, sécurisée et entièrement en français/anglais.

---

## 🎯 Vision

Glou est conçu pour les amateurs de vin et spiritueux qui souhaitent :
- **Gérer leur inventaire** avec précision (catégories adaptées, champs contextuels)
- **Suivre l'apogée** de chaque bouteille et recevoir des alertes
- **Préserver leurs données** en maître (souveraineté + export facile)
- **Accéder offline** à leur cave même sans connexion réseau
- **Partager privément** avec des proches ou experts sans exposer les données sensibles

Destiné à un **usage privé** (Home Lab), sans dépendance cloud imposée.

---

## ✨ Fonctionnalités Implémentées

### ✅ FEAT-01 : Gestion des Bouteilles (CRUD + Soft-Delete)
- **Création/Édition** : Parcours en deux temps (tronc commun + champs optionnels repliables)
- **Catégories** : Vin, Champagne, Spiritueux, Cigares/Boîtes
- **Soft-Delete** : Corbeille auto-expirante après 7 jours
- **Optimistic UI** : Mutations immédiates côté client, sync serveur en arrière-plan
- **Restauration** : Bouton "Annuler" pendant la fenêtre de grâce
- **Validation** : Schémas Zod discriminés par catégorie
- **Internationalisation** : FR/EN natives

📋 [Spécification complète](./\.vibe\/features\/implemented\/FEAT-01\/feature.md)  
📊 [Rapport d'implémentation](./\.vibe\/features\/implemented\/FEAT-01\/implementation-report.md)

### ✅ FEAT-02 : Accès Sécurisé & 2FA
- **Authentification** : Registration + Login avec validation stricte (min 12 caractères)
- **2FA TOTP** : Setup via QR code + codes de récupération (10 codes)
- **Sessions** : Gestion liste, révocation à distance, device "de confiance"
- **Audit** : Table `security_events` avec logging complet (IP, User-Agent)
- **Support HTTPS** : Cookies httpOnly, X-Forwarded-For
- **Internationalisation** : 150+ clés i18n

📋 [Spécification complète](./\.vibe\/features\/implemented\/FEAT-02\/feature.md)  
📊 [Rapport d'implémentation](./\.vibe\/features\/implemented\/FEAT-02\/implementation-report.md)

### ✅ FEAT-03 : Profils Utilisateurs & Rôles
- **Profils** : Display name, avatar, slogan, préférences (langue, thème, unités)
- **Rôles** : `admin` (propriétaire) et `user` (invité évolué)
- **Notifications** : Configuration canaux (e-mail, Gotify/webhook, in-app)
- **Branding App** : Nom, slogan, logo configurables par admin
- **Synchronisation** : Préférences appliquées en temps réel (i18n, thème, accent)

📋 [Spécification complète](./\.vibe\/features\/implemented\/FEAT-03\/feature.md)  
📊 [Rapport d'implémentation](./\.vibe\/features\/implemented\/FEAT-03\/implementation-report.md)

---

## 🗺️ Roadmap — Fonctionnalités Planifiées

### Phase 2 (En cours de conception)
- **FEAT-04** : Scan Étiquette & Ajout Express (OCR/Vision)
- **FEAT-05** : Transparence des Sources & Trace des Overrides
- **FEAT-06** : Alertes Apogée & Fenêtre de Dégustation
- **FEAT-07** : Gestion des Bouteilles Entamées & Niveaux

### Phase 3 (Futur)
- **FEAT-08** : Plan de Consommation Intelligent & Rotation
- **FEAT-09** : Consommation Guidée par Accords Mets/Bouteilles
- **FEAT-10** : Étiquettes QR/NFC & Check-out Rapide
- **FEAT-11** : Bulk Edit & Workflows Rapides
- **FEAT-12** : Inventaire Physique Assisté

### Phase 4+ (Avancée)
- **FEAT-13** : Modélisation de Cave & Clayettes Paramétrables
- **FEAT-14** : Cartographie de Cave & Localisation Visuelle
- **FEAT-15** : Monitoring Hygro/Temp & Alertes de Dérive
- **FEAT-16** : Mode Hors-Ligne & Sync Confiance
- **FEAT-17** : Partage Privé & Mode Invité
- **FEAT-18** : Portabilité & Souveraineté des Données
- **FEAT-19** : Valorisation & Suivi de Marché
- **FEAT-20** : Wishlist, Veille Prix & Budget Perso
- **FEAT-21** : Analytique Perso & Rapports PDF
- **FEAT-22** : Journal de Dégustation & Recos Personnalisées
- **FEAT-23** : Offline First — Accès Sans Réseau

---

## 🛠️ Stack Technique

### Backend
- **Framework** : Node.js + Express
- **Langage** : TypeScript
- **Validation** : Zod
- **Base de données** : PostgreSQL
- **Logging** : Pino (structuré)

### Frontend
- **Framework** : Next.js (React 18+)
- **Langage** : TypeScript
- **State Management** : React Query / TanStack Query
- **Styling** : CSS-in-JS Dark Luxury (theme moderne)
- **i18n** : Centralisée (locales/*/common.json)

### Infrastructure
- **Containerisation** : Docker Compose (3 services)
- **Exécution** : Non-root (PUID/PGID configurable)
- **Config** : Variables `.env` (secrets, ports, URLs)

---

## 🚀 Démarrage Rapide

### Prérequis
- Docker & Docker Compose
- Node.js 18+ (pour dev local)
- PostgreSQL 14+ (ou utiliser le container)

### Installation

```bash
# 1. Cloner le repo
git clone <repo-url>
cd glou-server

# 2. Configurer .env
cp .env.example .env
# Éditer .env : DB_PASSWORD, API_URL, etc.

# 3. Lancer le stack complet
docker-compose up -d

# 4. Accéder à l'application
# Frontend  : http://localhost:3000
# API       : http://localhost:3001/api
# PostgreSQL: localhost:5432
```

### Développement Local

```bash
# Backend (terminal 1)
cd api
npm install
npm run dev

# Frontend (terminal 2)
cd web
npm install
npm run dev

# DB (terminal 3 - optionnel si utilisé local)
psql -U glou -h localhost -d glou
```

---

## 🔐 Sécurité & Conformité

✅ **Chiffrement** : Mots de passe PBKDF2 (100k itérations)  
✅ **2FA TOTP** : Support natif avec codes de récupération  
✅ **Sessions** : Token 256-bit httpOnly secure  
✅ **Audit** : Logging complet des événements sensibles  
✅ **Non-root** : Exécution conteneur sécurisée (PUID/PGID)  
✅ **Secrets** : Gestion via `.env` (jamais en dur)  
✅ **RGPD** : Gestion données privées + export/import  

---

## 📚 Documentation

### Architecture & Design
- [Design System](./\.vibe\/design.md)
- [Instructions Copilot](./\.github\/copilot-instructions.md)

### Fonctionnalités
Chaque feature dispose de sa propre documentation :
- Feature spec (`feature.md`)
- Rapport d'implémentation (`implementation-report.md`)
- QA report (`qa-report.md`)

### Déploiement
- [Guides spécifiques](./\.vibe\/features\/implemented\/) par feature

---

## 🧪 Tests

Tests et validation par feature :

| Feature | Tests | Couverture |
|---------|-------|-----------|
| FEAT-01 | ✅ Création, Édition, Soft-Delete, Restauration | ~85% |
| FEAT-02 | ✅ Auth, 2FA TOTP, Sessions, Audit | ~80% |
| FEAT-03 | ✅ Profils, Rôles, Notifications, Branding | ~75% |

**À améliorer** : Tests E2E (Cypress/Playwright), tests de charge.

---

## 🤝 Contribution

Ce projet est conçu pour un usage personnel/privé. Les contributions sont bienvenues via :
- Issues pour signaler bugs/idées
- PRs pour améliorations
- Discussions pour roadmap

### Convention de Code
- **Anglais métier** (variable names, commits)
- **Français UI** (i18n centralisée)
- **TypeScript strict**
- **Pas de dépendances exotiques** (YAGNI)

---

## 📄 Licence

À définir (MIT, GPL, propriétaire, etc.)

---

## 🙋 Support

Pour des questions ou problèmes :
1. Consulter la documentation `.vibe/`
2. Vérifier les issues existantes
3. Créer une nouvelle issue avec contexte

---

**Créé** : Janvier 2026  
**Status** : ✅ Production-Ready (Phase 1)  
**Mainteneur** : Romain (et autres contributeurs)
