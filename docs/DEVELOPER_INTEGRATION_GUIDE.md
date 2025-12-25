# Guide d'Intégration pour Développeurs

## 🎯 Qu'est-ce qui a changé?

Glou-Server a pivoté d'une application **"SaaS Multi-tenant"** vers une application **"Collection Privée"** (cave personnelle/familiale). Voici ce que vous devez savoir.

---

## 📂 Structure des Fichiers Modifiés

### Frontend (React)

```
web/src/
├── components/
│   ├── AdaptiveNavigationShell.jsx      [MODIFIED]
│   └── CollectionDashboard.jsx          [NEW]
├── screens/
│   ├── DashboardScreen.jsx              [MODIFIED]
│   └── AdvancedSettingsScreen.jsx       [NEW]
├── App.jsx                              [MODIFIED]
└── theme/
    └── appTheme.js                      (inchangé)
```

### Backend (Go)

```
cmd/api/
├── main.go                              (inchangé - routes ok)
├── admin_handlers.go                    (inchangé - logique intacte)
└── middleware.go                        (inchangé - JWT/RBAC ok)
```

### Documentation (NEW)

```
├── COLLECTION_PIVOT_SUMMARY.md          [NEW] - Résumé changements
├── TESTING_COLLECTION_PIVOT.md          [NEW] - Plan de test complet
└── GUIDELINES_COLLECTION_IDENTITY.md    [NEW] - Guidelines futurs développements
```

---

## 🚀 Démarrer le Développement

### 1. Environnement Frontend

```bash
cd web
npm install
npm start
```

**Port:** http://localhost:5173 (Vite)

### 2. Environnement Backend

```bash
cd cmd/api
go run main.go
```

**Port:** http://localhost:8080
**Database:** SQLite (`glou.db`)

### 3. Tests

```bash
# Frontend - selon TESTING_COLLECTION_PIVOT.md
npm test

# Backend - avec Postman ou curl
curl -X GET http://localhost:8080/api/wines \
  -H "Authorization: Bearer <JWT>"
```

---

## 📱 Architecture Responsive

### NavigationShell (AdaptiveNavigationShell.jsx)

**Mobile (<600px):**
- Bottom Navigation Bar avec 5 items
- Top App Bar avec notifications + profil

**Tablet (600-960px):**
- Navigation Rail (sidebar étroit)
- Top App Bar normal

**Desktop (>960px):**
- Drawer permanent (left sidebar)
- Section primaire: Ma Cave, Analyse, Mes Dégustations, Apogée
- Section secondaire (après divider): Gestion Avancée, Mon Profil

### Dashboard (CollectionDashboard.jsx)

**Sections:**
1. Welcome message + description
2. Quick actions (3 buttons: Camera, Barcode, Manual)
3. KPI Grid (4 cards: Ready to Drink, Peak, Inventory, Tastings)
4. Ready to Drink section (cards visuelles)
5. Recent Tastings section (list)

### Advanced Settings (AdvancedSettingsScreen.jsx)

**Cards:**
- Configuration de la Collection (Nom, Desc, Image Recognition)
- Sauvegarde & Export (Backup, Export CSV)
- Sécurité & Vie Privée (Encryption info, Password reset)
- Gestion des Données (Import, Delete)

---

## 🔐 Permissions & Sécurité

### Role-Based Access Control (RBAC)

```javascript
// Frontend - Hook Example
const useRequireRole = (requiredRole) => {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user'));
    if (userData?.role !== requiredRole) {
      window.location.href = '/';
    }
    setUser(userData);
  }, [requiredRole]);
  
  return user;
};

// Usage
const AdvancedSettings = () => {
  useRequireRole('admin'); // Will redirect if not admin
  // ...
};
```

### Routes protégées au Backend

```go
// Middleware
func adminOnly(next http.HandlerFunc) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    user := r.Context().Value("user").(*domain.User)
    if user.Role != "admin" {
      http.Error(w, "Forbidden", http.StatusForbidden)
      return
    }
    next(w, r)
  }
}

// Usage
s.router.HandleFunc("POST /api/admin/settings", 
  adminOnly(s.handleUpdateSettings))
```

---

## 🌐 Internationalisation (i18n)

### Pattern utilisé

```jsx
// Dans chaque composant
const userLang = typeof navigator !== 'undefined' 
  ? navigator.language.toLowerCase() 
  : 'en';
const isFr = userLang.startsWith('fr');
const t = (fr, en) => (isFr ? fr : en);

// Utilisation:
<Typography>{t('Ma Cave', 'My Collection')}</Typography>
<Button>{t('Enregistrer', 'Save')}</Button>
```

### Où ajouter des traductions

1. Identifier le texte en français
2. Trouver son équivalent anglais
3. Utiliser `t(fr, en)` dans le JSX
4. Tester dans les 2 langues (via DevTools)

### Traductions communes

Voir `GUIDELINES_COLLECTION_IDENTITY.md` → "Internationalisation (i18n)" pour tableau complet.

---

## 🎨 Design System

### Thème (MUI)

```javascript
// Accès au thème
const theme = useTheme();

// Couleurs principales
theme.palette.primary.main      // Bleu (Collection)
theme.palette.secondary.main    // Couleur secondaire
theme.palette.tertiary.main     // Couleur tertiaire
theme.palette.success.main      // Vert (Ready to Drink)
theme.palette.warning.main      // Orange (Peak)
theme.palette.error.main        // Rouge (Danger)
theme.palette.surface           // Fond clair
theme.palette.onSurface         // Texte sur surface
theme.palette.divider           // Lignes

// Breakpoints
theme.breakpoints.down('sm')    // < 600px
theme.breakpoints.between('sm', 'md') // 600-960px
theme.breakpoints.up('md')      // > 960px
```

### Spacing & Dimensions

```javascript
// Padding/Margin (8px = 1 unit)
sx={{ padding: 3 }}             // 24px
sx={{ margin: 2 }}              // 16px
sx={{ marginBottom: 4 }}        // 32px
sx={{ gap: 1 }}                 // 8px

// Border radius (consistent = 12px)
sx={{ borderRadius: '12px' }}

// Elevation (shadows)
sx={{ 
  boxShadow: `0 2px 8px ${alpha(color, 0.08)}` 
}}
```

### Composants à Réutiliser

```jsx
// Card template
<Card sx={{
  backgroundColor: theme.palette.surface,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: '12px',
}}>
  <CardHeader 
    avatar={<IconComponent />}
    title="Title"
  />
  <Divider />
  <CardContent>{/* Content */}</CardContent>
</Card>

// Button template
<Button
  variant="contained"
  startIcon={<IconComponent />}
  sx={{
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.onPrimary,
    textTransform: 'none',
    borderRadius: '8px',
  }}
>
  {t('French', 'English')}
</Button>
```

---

## 🔄 Workflows Courants

### 1. Ajouter une nouvelle page Admin

1. Créer `web/src/screens/NewAdminFeature.jsx`
2. Importer dans `App.jsx`
3. Créer route `/admin/feature`
4. Ajouter au composant backend `cmd/api/`
5. Tester permissions (admin-only)
6. Voir template dans `GUIDELINES_COLLECTION_IDENTITY.md`

### 2. Ajouter une nouvelle permission

1. Créer enum/constant au backend (`domain/`)
2. Mettre à jour middleware (`cmd/api/middleware.go`)
3. Protéger les routes avec middleware
4. Frontend: ajouter hook `useRequireRole`
5. Vérifier tests permissions

### 3. Ajouter une traduction

1. Identifier texte: `"Mon texte"`
2. Trouver équivalent EN: `"My text"`
3. Remplacer par: `{t('Mon texte', 'My text')}`
4. Tester en FR/EN
5. Documenter dans `GUIDELINES_COLLECTION_IDENTITY.md`

### 4. Modifier le Dashboard

1. Éditer `web/src/components/CollectionDashboard.jsx`
2. Ajouter/Supprimer sections selon besoin
3. S'assurer cohérence avec KPI (4 cards max)
4. Tester responsive (mobile/tablet/desktop)
5. Vérifier traductions FR/EN

---

## 🧪 Tests Locaux

### Checklist avant commit

```bash
# Frontend
- [ ] npm run build (no errors)
- [ ] npm start (loads without console errors)
- [ ] Test en FR/EN (DevTools > navigator.language)
- [ ] Test responsive (mobile 320px, tablet 768px, desktop 1920px)
- [ ] Permissions: User role (redirect from /admin)
- [ ] Permissions: Admin role (access /admin)

# Backend
- [ ] go run main.go (no panics)
- [ ] Test JWT middleware
- [ ] Test RBAC (User vs Admin)
- [ ] curl test to /api/wines

# Integration
- [ ] Frontend + Backend ensemble
- [ ] Login flow
- [ ] Add bottle (User)
- [ ] Edit settings (Admin only)
```

### Commands utiles

```bash
# Frontend debug
npm run dev -- --inspect-brk

# Backend debug
go run -gcflags="all=-N -l" main.go

# Test permissions
curl -X GET http://localhost:8080/api/admin/settings \
  -H "Authorization: Bearer <invalid-jwt>"
# Should return 401 or 403

# Check database
sqlite3 glou.db "SELECT * FROM users;"
```

---

## 🐛 Debugging Common Issues

### "Gestion Avancée" n'affiche que "À implémenter"

**Cause:** `AdminScreen` placeholder encore utilisé  
**Fix:** Vérifier `App.jsx` - doit importer `AdvancedSettingsScreen`

```jsx
import AdvancedSettingsScreen from './screens/AdvancedSettingsScreen';
```

### Textes en français ne s'affichent pas

**Cause:** `navigator.language` détection échoue  
**Fix:** Forcer langue dans DevTools:
```javascript
Object.defineProperty(navigator, 'language', {
  value: 'fr-FR'
});
```

### Dashboard vide (pas de bouteilles)

**Cause:** API retourne erreur ou liste vide  
**Fix:** Vérifier:
1. Backend tourne: `go run main.go`
2. JWT valide dans localStorage
3. Base de données SQLite existe
4. `api.getWines()` fonctionne

### Permission denied sur /admin

**Cause:** User ne peut pas y accéder  
**Fix:** C'est normal pour les non-admins! Tester avec admin token.

---

## 📊 Performance Tips

### Optimisations courantes

```javascript
// Lazy load images
<img loading="lazy" src="..." />

// Memoize expensive computations
const memoValue = useMemo(() => expensiveCalc(), [deps])

// Debounce search/filter
const debouncedSearch = useCallback(
  debounce((val) => setSearch(val), 300),
  []
)

// Pagination au lieu de all-at-once
<WineList items={wines.slice(0, 20)} />
```

### Monitoring (Frontend)

```javascript
// Measure component render time
useEffect(() => {
  console.time('DashboardLoad');
  return () => console.timeEnd('DashboardLoad');
}, []);
```

---

## 🔗 Ressources Utiles

| Resource | URL/Path |
|----------|----------|
| MUI Components | https://mui.com/api/overview/ |
| React Docs | https://react.dev |
| Go Docs | https://golang.org/doc |
| SQLite | https://sqlite.org |
| JWT | https://jwt.io |
| Testing | `TESTING_COLLECTION_PIVOT.md` |
| Guidelines | `GUIDELINES_COLLECTION_IDENTITY.md` |

---

## 👥 Contact & Support

Pour des questions spécifiques:

1. Vérifier `TESTING_COLLECTION_PIVOT.md` (checklist complète)
2. Consulter `GUIDELINES_COLLECTION_IDENTITY.md` (design standards)
3. Lire le code source (bien commenté)
4. Chercher dans les issues GitHub

---

## 🎓 Conclusion

Le pivot vers "Collection Privée" change **l'UX & branding**, mais préserve la **robustesse technique**. Les développeurs doivent:

1. ✅ Utiliser le nouveau lexique (Ma Cave, Apogée, etc.)
2. ✅ Respecter la structure de composants
3. ✅ Maintenir les permissions Admin/User
4. ✅ Supporter FR/EN
5. ✅ Tester responsive design

**Bienvenue dans l'équipe Glou! 🍷**

---

**Dernière mise à jour:** Décembre 2025  
**Version:** 1.0
