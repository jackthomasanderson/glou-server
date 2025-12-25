# 🔍 IMPORTANT: Comment Voir les Changements Frontend

Le problème: Vous testez sur `http://localhost:8080` (serveur Go)

Mais les fichiers React modifiés sont dans `./web/src`

## ✅ Solution: Lancer le Frontend React en Développement

### Option 1: Script Automatique (RECOMMANDE)

```powershell
.\start-dev.ps1
```

Cela va:
1. Démarrer le backend API (port 8080)
2. Lancer le frontend Vite (port 3000)
3. Ouvrir une nouvelle fenêtre PowerShell pour le dev server

Accédez à: **http://localhost:3000**

### Option 2: Manuel (Deux Terminaux)

**Terminal 1 - Backend:**
```powershell
.\docker-dev.ps1 up
# ou
docker-compose -f docker-compose.dev.yml up -d
```

**Terminal 2 - Frontend:**
```powershell
cd web
npm install  # (une seule fois)
npm run dev
```

Puis ouvrez: **http://localhost:3000**

## 🎯 URLs à Tester

| URL | Ce que c'est | Statut |
|-----|-------------|--------|
| http://localhost:8080 | Interface statique (vieille version) | ❌ N'utilise pas vos changements |
| http://localhost:3000 | Frontend React en développement | ✅ Utilise vos changements |

## 🚀 Nouvelles Fonctionnalités à Tester

### 1. Hub d'Ajout - Route: `/add`

Accédez à: **http://localhost:3000/add**

Vous devriez voir:
- Card "Ajouter une cave" → `/cellars/add`
- Card "Ajouter une boisson" → `/bottles/add`  
- Card "Ajouter du tabac" → `/tobacco/add`

### 2. Formulaire Vin Amélioré - Route: `/bottles/add`

**Nouvelles fonctionnalités:**
- ✅ Champ "Valeur actuelle" (current_value)
- ✅ Affichage ROI en direct (prix - valeur = profit/perte)
- ✅ Bouton "Enregistrer et ajouter un autre"
- ✅ Placeholder "Photo" (désactivé, marqué "prochainement")
- ✅ Suggestions apogée selon type

### 3. Formulaire Tabac - Route: `/tobacco/add`

**Nouvelles fonctionnalités:**
- ✅ Champ "Valeur actuelle"
- ✅ Affichage ROI
- ✅ Tous les champs tabac

### 4. Gestion Caves - Route: `/cave`

**Nouvelles fonctionnalités:**
- ✅ Jauge liquide animée (percentage bar avec gradient)
- ✅ Graphique en camembert (Product Type Distribution)
- ✅ Safe delete (empêche si produits présents)

### 5. Détail Vin - Route: `/wines/:id`

**Nouvelles fonctionnalités:**
- ✅ Badge maturité (couleur: En garde 🔵 / Apogée 🟠 / Déclin 🔴)
- ✅ Boutons ±1 pour ajuster stock rapidement

### 6. Écran Alertes - Route: `/alerts`

**Nouvelles fonctionnalités:**
- ✅ Section "Alertes Vins"
- ✅ Section "Alertes Tabac"  
- ✅ Compteur total: "X alertes (Y vins, Z tabacs)"
- ✅ Bouton "Générer alertes tabac"

### 7. Dashboard - Route: `/dashboard`

**Nouvelles fonctionnalités:**
- ✅ Section "Vins à déguster maintenant"
- ✅ Affiche top 5 dans fenêtre apogée

## 🔧 Compilation Alternative

Si vous préférez compiler pour production:

```powershell
cd web
npm run build
```

Les fichiers seront dans `web/dist/`

Puis copier vers `./assets/` pour servir par le backend

## 📋 Checklist

- [ ] Backend lancé? `docker-compose -f docker-compose.dev.yml up -d`
- [ ] Frontend lancé? `npm run dev` (depuis `./web`)
- [ ] Accédez à http://localhost:3000
- [ ] Créé compte admin? (si nécessaire)
- [ ] Voir `/add` → `/bottles/add` → Formulaire vin avec ROI, bouton save+add
- [ ] Voir `/cave` → Jauge + pie chart
- [ ] Voir `/wines/:id` → Badge maturité + boutons ±1
- [ ] Voir `/alerts` → Alertes vins ET tabac

## 🐛 Dépannage

### "Cannot GET" sur http://localhost:3000

→ Le dev server n'est pas lancé
→ Terminal 2: `cd web && npm run dev`

### Changements ne s'affichent pas

→ Vous êtes sur http://localhost:8080 (static)
→ Allez sur http://localhost:3000 (React dev)

### Erreur npm

```powershell
cd web
rm -r node_modules
npm install
npm run dev
```

### Port 3000 déjà utilisé

```powershell
# Finder quel processus
lsof -i :3000

# Ou changer le port dans vite.config.js
```

---

**Résumé**: Utilisez **`.\start-dev.ps1`** ou lancez `npm run dev` depuis `./web`
