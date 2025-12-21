# 🍷 Glou - Guide de Démarrage Rapide

Application professionnelle de gestion de cave à vin avec interface web moderne.

## 📋 Prérequis

1. **Go 1.21+** - Pour le serveur backend
2. **Node.js 18+** - Pour l'interface React (télécharger depuis https://nodejs.org/)

## 🚀 Installation en 3 étapes

### Étape 1 : Installer Node.js

Si vous n'avez pas Node.js installé :
1. Téléchargez-le depuis https://nodejs.org/ (version LTS recommandée)
2. Installez avec les options par défaut
3. Redémarrez votre terminal
4. Vérifiez : `node --version` et `npm --version`

### Étape 2 : Build automatique

Utilisez le script PowerShell fourni :

```powershell
.\build-and-run.ps1
```

Ce script va automatiquement :
- ✓ Vérifier Node.js
- ✓ Installer les dépendances npm
- ✓ Builder l'application React
- ✓ Compiler le serveur Go
- ✓ Proposer de démarrer le serveur

### Étape 3 : Accéder à l'application

Ouvrez votre navigateur sur : **http://localhost:8080**

## 🔧 Build manuel (si nécessaire)

Si vous préférez faire les étapes manuellement :

```powershell
# 1. Installer les dépendances npm
cd web
npm install

# 2. Builder l'application React
npm run build

# 3. Retour à la racine et compilation Go
cd ..
go build ./cmd/api

# 4. Démarrer le serveur
.\api.exe
```

## 📱 URLs de l'application

Une fois le serveur démarré, l'application supporte les URLs propres :

- **/** → Dashboard principal
- **/dashboard** → Tableau de bord
- **/analytics** → Analytics et heatmap
- **/wines** → Liste des vins
- **/wines/create** → Ajouter un vin
- **/cave** → Gestion des caves
- **/alerts** → Alertes de stock/apogée
- **/tasting-history** → Historique de dégustation
- **/admin** → Administration

## 🛠️ Développement

### Mode développement avec hot-reload

Pour développer l'interface avec rechargement automatique :

```powershell
# Terminal 1 : Backend Go
go run ./cmd/api

# Terminal 2 : Frontend React (avec proxy vers le backend)
cd web
npm run dev
```

Puis ouvrez http://localhost:3000 (le frontend proxy les requêtes API vers :8080)

### Rebuild rapide

Après modification du code React :

```powershell
cd web
npm run build
```

Après modification du code Go :

```powershell
go build ./cmd/api
```

## 📚 Documentation complète

- [Documentation EN](documentation/EN/README.md)
- [Documentation FR](documentation/FR/README.md)
- [Frontend README](web/README.md) - Détails sur l'application React

## 🎨 Architecture

```
glou-server/
├── cmd/api/              # Serveur HTTP Go
├── internal/             # Code Go interne
│   ├── domain/          # Modèles de données
│   ├── store/           # Base de données SQLite
│   ├── enricher/        # APIs externes
│   └── notifier/        # Notifications
├── web/                  # Application React
│   ├── src/             # Code source React
│   ├── dist/            # Build de production (généré)
│   └── index.html       # Point d'entrée
└── assets/               # Ancien HTML (obsolète)
```

## ⚙️ Configuration

Le serveur utilise des variables d'environnement (optionnelles) :

```bash
PORT=8080                    # Port du serveur (défaut: 8080)
DB_PATH=./glou.db           # Chemin de la base de données
ENVIRONMENT=development      # development ou production
ALLOWED_ORIGINS=*           # CORS origins
```

## 🔄 Mise à jour

Pour mettre à jour l'application :

```powershell
# Mettre à jour les dépendances Go
go get -u ./...
go mod tidy

# Mettre à jour les dépendances npm
cd web
npm update

# Rebuild
cd ..
.\build-and-run.ps1
```

## 🐛 Dépannage

### "npm n'est pas reconnu"
→ Node.js n'est pas installé ou pas dans le PATH. Installez Node.js et redémarrez le terminal.

### "Cannot GET /"
→ L'application React n'a pas été buildée. Exécutez `cd web && npm run build`

### Port 8080 déjà utilisé
→ Modifiez le port avec la variable d'environnement : `$env:PORT=8081; .\api.exe`

### Erreur CORS
→ Vérifiez que vous accédez bien via http://localhost:8080 et non une autre origine

## 📞 Support

Pour plus d'informations :
- Consultez la [documentation complète](DOCUMENTATION_INDEX.md)
- Vérifiez les [notes de version](CHANGELOG.md)
- Lisez le [guide utilisateur](HEATMAP_USER_GUIDE.md)

## 🎯 Fonctionnalités principales

- ✅ Gestion complète de caves à vin
- ✅ Tracking des bouteilles avec position exacte
- ✅ Heatmap visuelle des régions viticoles
- ✅ Alertes de stock bas et apogée
- ✅ Historique de dégustation avec notes
- ✅ Enrichissement automatique via APIs externes
- ✅ Export/Import JSON et CSV
- ✅ Interface Material Design 3 adaptative (mobile/tablette/desktop)
- ✅ Mode sombre/clair
- ✅ API REST complète
- ✅ Base de données SQLite intégrée
