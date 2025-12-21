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

### 2. Installer les dépendances

```powershell
cd c:\Users\Romain\Documents\_dev\glou-server\glou-server\web
npm install
```

Cette commande va télécharger toutes les dépendances nécessaires (React, Material-UI, etc.)

## Build de production

Pour créer la version optimisée de l'application :

```powershell
cd c:\Users\Romain\Documents\_dev\glou-server\glou-server\web
npm run build
```

Cette commande crée un dossier `dist/` contenant :
- `index.html` - Point d'entrée de l'application
- `assets/` - JavaScript et CSS optimisés

Le serveur Go est configuré pour servir automatiquement ces fichiers.

## Développement

Pour développer avec rechargement automatique :

```powershell
npm run dev
```

L'application sera accessible sur http://localhost:3000 avec proxy automatique vers l'API Go.

## Structure

```
web/
├── index.html          # Point d'entrée HTML
├── vite.config.js      # Configuration Vite
├── package.json        # Dépendances npm
├── src/
│   ├── index.jsx       # Point d'entrée React
│   ├── App.jsx         # Composant principal avec routage
│   ├── components/     # Composants réutilisables
│   ├── screens/        # Pages de l'application
│   ├── services/       # Services API
│   ├── hooks/          # React hooks personnalisés
│   └── theme/          # Configuration Material-UI
└── dist/               # Build de production (généré)
```

## Déploiement

Après `npm run build`, le serveur Go sert automatiquement l'application depuis `web/dist/`.

Pour démarrer le serveur :

```powershell
cd c:\Users\Romain\Documents\_dev\glou-server\glou-server
go build ./cmd/api
.\api.exe
```

Accédez à http://localhost:8080

## URLs supportées

L'application supporte les URLs propres avec React Router :

- `/` → Redirige vers `/dashboard`
- `/dashboard` → Tableau de bord principal
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
