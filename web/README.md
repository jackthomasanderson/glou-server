# Glou Web Application

Application web React avec Material UI pour la gestion de cave à vin.

## Prérequis

- **Node.js 18+** (télécharger depuis https://nodejs.org/)
- **npm** (inclus avec Node.js)

## Installation

### 1. Installer Node.js

Si ce n'est pas déjà fait :
1. Téléchargez Node.js LTS depuis https://nodejs.org/
2. Installez-le avec les options par défaut
3. Redémarrez votre terminal/PowerShell
4. Vérifiez l'installation :
   ```powershell
   node --version
   npm --version
   ```

# Glou Web Application

English | Français

This repository contains the React frontend for Glou. Choose your language below:

- **English**: this file (web/README.md)
- **Français**: see `web/README.fr.md`

---

## Quick Start (English)

Prerequisites

- **Node.js 18+**
- **npm**

Install dependencies:

```powershell
cd c:\Users\Romain\Documents\_dev\glou-server\glou-server\web
npm install
```

Development:

```powershell
npm run dev
```

Build production:

```powershell
npm run build
```

Preview production build:

```powershell
npm run preview
```

Notes:

- The frontend uses Vite and proxies API calls to the Go backend (default port 8080).
- Ensure the `api` binary is running locally when developing.

---

Pour la version française, voir `web/README.fr.md`.
- `/analytics` → Analytics avancées
- `/alerts` → Alertes
- `/wines` → Liste des vins
- `/wines/:id` → Détail d'un vin
- `/wines/create` → Créer un nouveau vin
- `/wines/:id/edit` → Modifier un vin
- `/cave` → Gestion des caves
- `/tasting-history` → Historique de dégustation
- `/admin` → Administration
- `/user` → Profil utilisateur

## Scripts disponibles

- `npm run dev` - Serveur de développement avec HMR
- `npm run build` - Build de production optimisé
- `npm run preview` - Prévisualiser le build de production
- `npm run lint` - Vérifier le code avec ESLint
- `npm run lint:fix` - Corriger automatiquement les erreurs
- `npm run format` - Formater le code avec Prettier
- `npm run test` - Lancer les tests
- `npm run test:coverage` - Tests avec couverture de code
 - `npm run lint` - Vérifier le code avec ESLint
 - `npm run lint:fix` - Corriger automatiquement les erreurs
 - `npm run format` - Formater le code avec Prettier

## Technologies

- **React 18** - Framework UI
- **React Router 6** - Routage SPA
- **Material-UI 5** - Composants Material Design
- **Vite** - Build tool moderne et rapide
- **Axios** - Client HTTP
- **Zustand** - State management léger
- **Chart.js** - Graphiques et visualisations
- **date-fns** - Manipulation de dates

## Support navigateurs

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- iOS Safari 14+
- Android Chrome 90+
