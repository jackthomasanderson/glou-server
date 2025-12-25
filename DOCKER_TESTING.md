# Glou Server - Tests Docker Desktop

## 📋 Statut

✅ **Serveur démarré avec succès**
- Container: `glou-server-dev`
- Status: **healthy**
- Port: **8080**
- Base de données: nouvelle avec schéma complet (current_value, tobacco_alerts)

## 🧪 Tests Manuels

### 1. Health Check
```powershell
curl http://localhost:8080/health
```
✅ Réponse: `{"status":"healthy"}`

### 2. Setup Status
```powershell
Invoke-WebRequest -Uri "http://localhost:8080/api/setup/check" -UseBasicParsing
```
✅ Réponse: `{"has_admin":false,"needs_setup":true,"setup_complete":false}`

### 3. Accès Web Interface
Ouvrir dans le navigateur: **http://localhost:8080/setup**

### 4. Logs en temps réel
```powershell
docker logs -f glou-server-dev
```

### 5. Restart Container
```powershell
docker-compose -f docker-compose.dev.yml restart
```

### 6. Stop Container
```powershell
docker-compose -f docker-compose.dev.yml down
```

### 7. Rebuild and Start
```powershell
docker-compose -f docker-compose.dev.yml up -d --build
```

## 🗄️ Base de Données

**Emplacement**: `./data/glou.db`

**Tables créées**:
- ✅ `wines` (avec colonne `current_value` pour ROI)
- ✅ `tobaccos` 
- ✅ `tobacco_alerts` (nouvelles alertes tabac)
- ✅ `caves`
- ✅ `cells`
- ✅ `alerts` (alertes vins)
- ✅ `consumption_history`
- ✅ `users`
- ✅ `sessions`
- ✅ `settings`
- ✅ `activity_log`

## 🔧 Fonctionnalités Testables

### Après Setup Initial (créer un compte admin)

1. **Vins avec ROI**
   - Ajouter un vin avec `price` et `current_value`
   - Vérifier le calcul ROI dans l'interface

2. **Tabac**
   - Ajouter un produit tabac
   - Vérifier le calcul ROI

3. **Alertes Tabac**
   - Ajouter un tabac avec quantité < 2
   - Générer les alertes: `POST /tobacco-alerts/generate`
   - Vérifier dans l'écran Alertes

4. **Vins à boire maintenant**
   - Ajouter des vins avec apogée actuel
   - Vérifier endpoint: `GET /wines/drinkable`

5. **Caves avec jauge et pie chart**
   - Créer une cave
   - Ajouter vins/tabacs
   - Vérifier les visuels (jauge, camembert)

6. **Badge de maturité**
   - Vins avec dates d'apogée
   - Vérifier les badges (En garde/Apogée/Déclin)

## 📊 Monitoring Docker Desktop

1. Ouvrir **Docker Desktop**
2. Aller dans l'onglet **Containers**
3. Trouver `glou-server-dev`
4. Cliquer pour voir:
   - Logs
   - Stats (CPU, Memory)
   - Inspect
   - Terminal

## 🌐 Accès Frontend (si développement web)

Si vous voulez développer le frontend en parallèle:

```powershell
cd web
npm install
npm run dev
```

Le frontend sera accessible sur: http://localhost:3000
Et communiquera avec l'API Docker sur: http://localhost:8080

## ✨ Fonctionnalités Complètes Implémentées

- ✅ Gestion Vins/Bières/Spiritueux avec ROI
- ✅ Gestion Tabac avec ROI
- ✅ Alertes Vins (stock, apogée)
- ✅ Alertes Tabac (stock faible)
- ✅ Caves avec jauge liquide et pie chart
- ✅ Badge maturité (couleur selon apogée)
- ✅ Boutons ±1 stock rapide
- ✅ Suggestions apogée prédictives
- ✅ Save & Add Another (formulaires)
- ✅ Photo upload placeholder
- ✅ Vins à boire maintenant

Bon test! 🚀
