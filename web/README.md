# 🌐 Glou Web Application

The modern, responsive web interface for the Glou wine cellar management system. Built with React, Vite, and Material UI.

**[English]** | **[Français](../docs/FR/WEB_README.md)**

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **npm 9+**

### Installation
```bash
# Install dependencies
npm install
```

### Development
```bash
# Start the development server
npm run dev
```
The application will be available at `http://localhost:5173`. By default, it expects the API to be running at `http://localhost:8080`.

### Production Build
```bash
# Build for production
npm run build
```
The optimized assets will be generated in the `dist/` folder.

---

## 🛠️ Tech Stack

- **Framework**: [React 18](https://reactjs.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Data Fetching**: [React Query](https://tanstack.com/query/v3)
- **Styling**: [Material UI](https://mui.com/)
- **Charts**: [Chart.js](https://www.chartjs.org/) with `react-chartjs-2`
- **Routing**: [React Router 6](https://reactrouter.com/)

---

## 📁 Project Structure

- `src/components/`: Reusable UI components (Heatmaps, Cards, etc.)
- `src/hooks/`: Custom React hooks for data fetching and logic.
- `src/screens/`: Main application pages (Dashboard, Inventory, Settings).
- `src/store/`: Zustand store for global state management.
- `src/theme/`: Material UI theme configuration.

---

## 🤝 Contributing

Please refer to the main [Development Guide](../docs/DEVELOPMENT.md) for contribution instructions.

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
