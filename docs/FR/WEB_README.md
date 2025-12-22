# 🌐 Glou Application Web

L'interface web moderne et responsive pour le système de gestion de cave à vin Glou. Développée avec React, Vite et Material UI.

**[English](README.md)** | **[Français]**

---

## 🚀 Démarrage Rapide

### Prérequis
- **Node.js 18+**
- **npm 9+**

### Installation
```bash
# Installer les dépendances
npm install
```

### Développement
```bash
# Lancer le serveur de développement
npm run dev
```
L'application sera disponible sur `http://localhost:5173`. Par défaut, elle s'attend à ce que l'API tourne sur `http://localhost:8080`.

### Build de Production
```bash
# Créer la version de production
npm run build
```
Les fichiers optimisés seront générés dans le dossier `dist/`.

---

## 🛠️ Stack Technique

- **Framework** : [React 18](https://reactjs.org/)
- **Outil de Build** : [Vite](https://vitejs.dev/)
- **Gestion d'État** : [Zustand](https://github.com/pmndrs/zustand)
- **Récupération de Données** : [React Query](https://tanstack.com/query/v3)
- **Styling** : [Material UI](https://mui.com/)
- **Graphiques** : [Chart.js](https://www.chartjs.org/) avec `react-chartjs-2`
- **Routage** : [React Router 6](https://reactrouter.com/)

---

## 📁 Structure du Projet

- `src/components/` : Composants UI réutilisables (Heatmaps, Cartes, etc.)
- `src/hooks/` : Hooks React personnalisés pour la logique et les appels API.
- `src/screens/` : Pages principales de l'application (Tableau de bord, Inventaire, Paramètres).
- `src/store/` : Store Zustand pour la gestion de l'état global.
- `src/theme/` : Configuration du thème Material UI.

---

## 🤝 Contribuer

Veuillez vous référer au [Guide de Développement](../docs/DEVELOPMENT.md) principal pour les instructions de contribution.

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
cd c:\Users\Romain\Documents\_dev\glou-server\glou-server\web
npm run dev
```

Cette version lancera le serveur de développement Vite et utilisera le proxy configuré vers l'API Go (port 8080).

---

## Commandes utiles

- `npm run dev` - mode développement
- `npm run build` - build production
- `npm run preview` - servir la build locale pour vérification

---

## Notes

- Assurez-vous que l'API (binaire `api`) tourne localement sur le port configuré par le proxy (par défaut 8080).
- Si vous utilisez Docker, build et run via les scripts à la racine.
