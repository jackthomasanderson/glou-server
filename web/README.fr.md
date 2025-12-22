# Glou Application Web

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
