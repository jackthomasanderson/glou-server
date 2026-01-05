# Glou — Gestion Intelligente de Cave Privée

Glou est une application web moderne et sécurisée dédiée à la gestion complète d'une cave à vin, d'une collection de spiritueux ou de cigares. Conçue pour l'auto-hébergement et l'usage privé, elle met l'accent sur l'intégrité des données, la transparence des sources et l'optimisation de la consommation.

## 🎯 Objectif

Fournir aux collectionneurs privés une solution de gestion d'inventaire :
- **Intuitive** : création rapide de fiches, ajout par scan/OCR
- **Fiable** : authentification 2FA, sessions sécurisées, soft-delete réversible
- **Transparente** : tracking des sources, historique des modifications, overrides utilisateur prioritaires
- **Résiliente** : mode hors-ligne, synchronisation confiance, exports portables

## 🏗️ Stack Technologique

- **Frontend** : Next.js 14 (App Router), React 18, TypeScript, TailwindCSS, React Query
- **Backend** : Node.js, Express, TypeScript
- **Base de Données** : PostgreSQL
- **Infrastructure** : Docker Compose, Support PUID/PGID
- **Internationalisation** : FR/EN centralisées

## 🚀 Installation Rapide

### Prérequis
- Docker & Docker Compose
- Node.js 18+ (pour développement local)
- PostgreSQL 14+ (ou via Docker)

### Démarrage

```bash
# Cloner le repo
git clone https://github.com/votre-org/glou-server.git
cd glou-server

# Copier le .env exemple
cp .env.example .env
# Éditer .env avec vos paramètres (DB_PASSWORD, CORS_ORIGIN, etc.)

# Démarrer avec Docker Compose
docker-compose up -d

# Ou en développement local :
cd api && npm install && npm run dev
cd ../web && npm install && npm run dev
```

L'application est accessible sur `http://localhost:3000`.

## ✨ Fonctionnalités

### ✅ Implémentées

#### **FEAT-01 : CRUD Bouteille avec Soft-Delete (Complétée)**
Gestion complète d'inventaire avec création/édition/suppression réversible.
- Catégories adaptées (Vin, Champagne, Spiritueux, Cigares) avec champs contextuels
- Soft-delete 7 jours avec corbeille et bouton "Annuler"
- Optimistic UI : mutations instantanées côté client
- Validation Zod stricte + schémas discriminés par catégorie
- i18n FR/EN complète
- **État** : ✅ Prêt pour déploiement
- **Documentation** : [`.vibe/features/implemented/FEAT-01/`](.vibe/features/implemented/FEAT-01/)

#### **FEAT-02 : Accès Sécurisé & 2FA (Complétée)**
Authentification robuste avec 2FA TOTP, gestion des sessions et audit.
- Registration/Login avec validation (min 12 caractères)
- 2FA TOTP avec QR code et codes de récupération
- Gestion sessions : liste, révocation, trust device
- Audit logging (security_events) avec IP + User-Agent
- Support X-Forwarded-For (proxy)
- **État** : ✅ Prêt pour déploiement
- **Documentation** : [`.vibe/features/implemented/FEAT-02/`](.vibe/features/implemented/FEAT-02/)

#### **FEAT-03 : Profils Utilisateurs & Rôles (Complétée)**
Gestion des profils, préférences et rôles d'administration.
- Profils : display name, avatar, préférences (locale, thème, unités)
- Rôles : admin (propriétaire) / user (invité) avec permissions adaptées
- Notifications : webhooks/Gotify + endpoint de test
- Branding applicatif (nom, slogan, logo) configurable
- Mutations optimistes (rollback sur erreur)
- **État** : ✅ Prêt pour déploiement
- **Documentation** : [`.vibe/features/implemented/FEAT-03/`](.vibe/features/implemented/FEAT-03/)

### 📋 Roadmap

#### Phase 2 (Prochainement)

| Numéro | Titre | État | Notes |
|--------|-------|------|-------|
| FEAT-04 | Scan Étiquette & Ajout Express | 🔄 WIP | Capture OCR/vision, préremplissage auto |
| FEAT-05 | Transparence des Sources & Trace des Overrides | 🔄 WIP | Source tracking, historique, restauration |
| FEAT-06 | Alertes Apogée & Fenêtre de Dégustation | 🔄 WIP | Calendrier personnalisé, notifications |
| FEAT-07 | Gestion des Bouteilles Entamées & Niveaux | 🔄 WIP | Statut, rappels consommation |
| FEAT-08 | Plan de Consommation Intelligent & Rotation | 🔄 WIP | Suggestions priorisées, objectifs |
| FEAT-09 | Consommation Guidée par Accords Mets/Bouteilles | 🔄 WIP | Suggestions d'accords, logging dégustations |
| FEAT-10 | Étiquettes QR/NFC & Check-out Rapide | 🔄 WIP | Génération, scan, historique |
| FEAT-11 | Bulk Edit & Workflows Rapides | 🔄 WIP | Multi-sélection, presets d'actions |
| FEAT-12 | Inventaire Physique Assisté | 🔄 WIP | Comptage guidé, écart détection |
| FEAT-13 | Modélisation de Cave & Clayettes | 🔄 WIP | Config physique, capacité |
| FEAT-14 | Cartographie de Cave & Localisation Visuelle | 🔄 WIP | Plan interactif, recherche |
| FEAT-15 | Monitoring Hygro/Temp & Alertes | 🔄 WIP | Capteurs, dérives, historique |
| FEAT-16 | Mode Hors-Ligne & Sync Confiance | 🔄 WIP | PWA, IndexedDB, replay mutations |
| FEAT-17 | Partage Privé & Mode Invité | 🔄 WIP | Liens temporaires, lecture seule, suggestions |
| FEAT-18 | Portabilité & Souveraineté des Données | 🔄 WIP | Export CSV/JSON, réimport, audit |
| FEAT-19 | Valorisation & Suivi de Marché | 🔄 WIP | Prix, courbes, alertes |
| FEAT-20 | Wishlist, Veille Prix & Budget | 🔄 WIP | Planning achats, budget tracking |
| FEAT-21 | Analytique Perso & Rapports PDF | 🔄 WIP | Tableaux de bord, export PDF |
| FEAT-22 | Journal de Dégustation & Recos | 🔄 WIP | Notes sensorielles, recommandations |
| FEAT-23 | Offline First — Accès Sans Réseau | 🔄 WIP | Service Worker, sync auto |

## 🛠️ Développement

### Structure du Projet

```
glou-server/
├── api/                          # Backend Node.js/Express
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/               # API endpoints
│   │   ├── services/             # Business logic
│   │   ├── schemas/              # Zod validation
│   │   ├── middleware/           # Auth, logging
│   │   └── utils/
│   ├── package.json
│   └── tsconfig.json
│
├── web/                          # Frontend Next.js
│   ├── app/
│   │   ├── (dashboard)/          # Routes protégées
│   │   ├── api/                  # Proxy API
│   │   ├── login/
│   │   └── register/
│   ├── components/               # React components
│   ├── lib/                      # Utilities, hooks, services
│   ├── locales/                  # i18n (FR/EN)
│   ├── package.json
│   └── tsconfig.json
│
├── db/
│   └── init/
│       ├── 01-init.sql           # Schéma initial
│       ├── 02-auth-schema.sql    # Auth (FEAT-02)
│       └── 03-feat-03-profiles-roles.sql
│
├── docker-compose.yml
├── .env.example
└── .github/
    └── copilot-instructions.md   # Règles Copilot
```

### Commandes Usuelles

**Backend**
```bash
cd api
npm install
npm run dev          # Développement (watch mode)
npm run build        # Build TypeScript
npm test             # Tests (à ajouter)
```

**Frontend**
```bash
cd web
npm install
npm run dev          # Développement (port 3000)
npm run build        # Build Next.js
npm run start        # Production
```

**Docker**
```bash
docker-compose up -d              # Démarrer
docker-compose down               # Arrêter
docker-compose logs -f api        # Logs backend
docker-compose logs -f web        # Logs frontend
```

## 🔒 Sécurité

- **Authentification** : 2FA TOTP, sessions sécurisées (httpOnly cookie)
- **Mot de passe** : PBKDF2 (100k itérations), min 12 caractères
- **Chiffrement** : Support TLS en production, secrets via .env
- **Audit** : Logging complet des événements sécurité (security_events table)
- **CORS** : Configurable via .env, adapté au déploiement privé
- **Non-root** : Support PUID/PGID Docker pour exécution sécurisée

## 🌍 Internationalisation

Toutes les chaînes UI sont centralisées dans `web/locales/{en,fr}/common.json`.
Aucun texte en dur dans le code — utiliser la fonction `t()` via le hook i18n.

Langues supportées :
- 🇫🇷 Français
- 🇬🇧 Anglais

## 📚 Documentation

- **Spécifications détaillées** : [`.vibe/design.md`](.vibe/design.md)
- **Instructions Copilot** : [`.github/copilot-instructions.md`](.github/copilot-instructions.md)
- **Features implémentées** : [`.vibe/features/implemented/`](.vibe/features/implemented/)
- **API Reference** : [`.vibe/features/implemented/FEAT-02/API-ENDPOINTS.md`](.vibe/features/implemented/FEAT-02/API-ENDPOINTS.md)

## 🤝 Contribution

Les contributions sont bienvenues ! Avant de démarrer :
1. Consulter [`.github/copilot-instructions.md`](.github/copilot-instructions.md)
2. Respecter le stack et les conventions du projet
3. Ajouter des tests et de la documentation

## 📄 Licence

À définir (consultez les responsables du projet).

## 👥 Support

Pour les problèmes, consultez :
- Logs Docker : `docker-compose logs api` / `web`
- Aide Copilot : Via `.github/agents/`
- Issues/PR : Via le dépôt GitHub

---

**Dernière mise à jour** : 5 janvier 2026  
**Version** : 1.0.0 (Alpha — FEAT-01, FEAT-02, FEAT-03 déployées)
