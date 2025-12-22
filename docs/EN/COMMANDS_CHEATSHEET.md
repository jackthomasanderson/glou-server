# 🚀 Commandes Essentielles - Glou

## ⚡ Démarrage rapide (recommandé)

```powershell
.\build-and-run.ps1
```

Cette commande unique fait tout automatiquement.

---

## 📦 Installation initiale (une seule fois)

### 1. Installer Node.js
Télécharger depuis : https://nodejs.org/
Version recommandée : **LTS (Long Term Support)**

### 2. Installer les dépendances
```powershell
cd web
npm install
cd ..
```

---

## 🔨 Build complet

### Option A : Script automatique
```powershell
.\build-and-run.ps1
```

### Option B : Étapes manuelles
```powershell
# 1. Build React
cd web
npm run build
cd ..

# 2. Build Go
go build ./cmd/api

# 3. Démarrer
.\api.exe
```

---

## 🎯 Accès à l'application

**URL principale :** http://localhost:8080

**URLs disponibles :**
- `/dashboard` - Tableau de bord
- `/wines` - Liste des vins
- `/cave` - Gestion cave
- `/alerts` - Alertes
- `/analytics` - Analytics

---

## 🔧 Développement

### Mode développement avec hot-reload

**Terminal 1 - Backend :**
```powershell
go run ./cmd/api
```

**Terminal 2 - Frontend :**
```powershell
cd web
npm run dev
```

Puis ouvrir http://localhost:3000

### Rebuild rapide après modification

**Frontend uniquement :**
```powershell
cd web
npm run build
```

**Backend uniquement :**
```powershell
go build ./cmd/api
```

---

## 🛑 Arrêter le serveur

**Ctrl+C** dans le terminal où tourne `api.exe`

Ou forcer l'arrêt :
```powershell
Stop-Process -Name api -Force
```

---

## 🔄 Redémarrage rapide

```powershell
Stop-Process -Name api -Force -ErrorAction SilentlyContinue
.\api.exe
```

---

## 📊 Commandes utiles

### Vérifier les versions
```powershell
node --version
npm --version
go version
```

### Nettoyer et rebuild complet
```powershell
# Nettoyer le build React
cd web
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npm run build
cd ..

# Nettoyer et rebuild Go
Remove-Item api.exe -ErrorAction SilentlyContinue
go build ./cmd/api
```

### Réinitialiser la base de données
```powershell
Stop-Process -Name api -Force -ErrorAction SilentlyContinue
Remove-Item glou.db -ErrorAction SilentlyContinue
.\api.exe
```

### Mettre à jour les dépendances
```powershell
# Dépendances Go
go get -u ./...
go mod tidy

# Dépendances npm
cd web
npm update
cd ..
```

---

## ❌ Dépannage

### Problème : "npm n'est pas reconnu"
**Solution :** Installer Node.js puis redémarrer le terminal

### Problème : Port 8080 déjà utilisé
**Solution :** Changer le port
```powershell
$env:PORT=8081
.\api.exe
```

### Problème : Erreur de build React
**Solution :** Nettoyer et réinstaller
```powershell
cd web
Remove-Item -Recurse -Force node_modules, dist
npm install
npm run build
cd ..
```

### Problème : "Cannot GET /dashboard"
**Solution :** L'app React n'est pas buildée
```powershell
cd web
npm run build
cd ..
go build ./cmd/api
.\api.exe
```

### Problème : Modifications non visibles
**Solution :** Vider le cache navigateur avec **Ctrl+Shift+R**

---

## 📁 Structure des fichiers générés

```
glou-server/
├── api.exe              ← Serveur compilé
├── glou.db              ← Base de données SQLite
└── web/
    ├── node_modules/    ← Dépendances npm (ne pas commit)
    └── dist/            ← Build React (ne pas commit)
        ├── index.html
        └── assets/
            ├── index-[hash].js
            └── index-[hash].css
```

---

## 🎓 Workflow typique

### Première installation
```powershell
.\build-and-run.ps1
```

### Développement quotidien
```powershell
# Terminal 1
go run ./cmd/api

# Terminal 2
cd web
npm run dev
# Accéder à http://localhost:3000
```

### Avant commit Git
```powershell
# Rebuild production
cd web
npm run build
cd ..
go build ./cmd/api

# Test final
.\api.exe
# Vérifier http://localhost:8080
```

### Déploiement
```powershell
# Build optimisé
.\build-and-run.ps1

# Copier ces fichiers sur le serveur :
# - api.exe
# - web/dist/ (tout le dossier)
# - glou.db (si migration de données)
```

---

## 📚 Documentation complète

 [Documentation EN](../README.en.md)
---

**💡 Tip:** Enregistrez cette page en favoris pour un accès rapide !
