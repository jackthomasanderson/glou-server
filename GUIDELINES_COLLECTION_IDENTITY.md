# Guidelines - Maintain "Collection Privée" Identity

## 📌 Principes de Conception

Lors des développements futurs, respectez ces principes pour maintenir l'identité "Collection Privée":

### 1. **Langage & Terminologie**
- ❌ AVOID: "Inventory", "Stock", "SKU", "Warehouse", "Bulk Import"
- ✅ USE: "Collection", "Cave", "Bottle", "Tasting", "Personal Library"

**Tableau de correspondance:**
| Ancien (SaaS) | Nouveau (Collection) |
|---|---|
| Product | Bottle / Item |
| Inventory | Collection |
| Admin Dashboard | Gestion Avancée |
| User Settings | Mon Profil |
| Bulk Upload | Import Collection |
| Analytics | Analyse |
| Audit Log | Journal de Bord |
| Stock Alert | Apogée Alert / À boire |
| Warehouse | Cave / Cellar |
| Customer | Collectionneur / You |

### 2. **Icônes & Visuels**
- Utilisez des icônes MUI qui évoquent la passion:
  - 🍷 `LocalDrink`, `LocalBar` pour les bouteilles
  - ❤️ `Favorite`, `FavoriteBorder` pour les favoris/dégustations
  - 📊 `BarChart`, `TrendingUp` pour les analyses
  - 🔐 `Security`, `VpnKey` pour la sécurité
  - 💾 `CloudDownload`, `SaveAlt` pour backups
  
- **Couleurs sémantiques:**
  - 🟢 Success/Vert: "À boire" / "Prêt"
  - 🟠 Warning/Orange: "À l'apogée" / "Attention"
  - 🔵 Primary/Bleu: Actions principales / "Ma Cave"
  - 🟣 Tertiary: Dégustations / Favoris

### 3. **Tone of Voice**
- 🎯 **Intime & Chaleureux**: "Bienvenue dans votre cave" (vs "Welcome to Admin Panel")
- 🎯 **Passionné**: Parlez du vin/tabac comme d'une passion, pas d'un stock
- 🎯 **Rassurant**: Soulignez la souveraineté des données et la sécurité
- 🎯 **Fluide**: Minimisez les clics, maximisez les raccourcis (Actions rapides)

**Exemples:**
- ❌ "Manage user permissions"
- ✅ "Inviter un ami à partager la dégustation"

- ❌ "Delete all inventory"
- ✅ "Réinitialiser votre collection"

---

## 🎨 Structure de Composants

### Niveaux hiérarchiques (à utiliser uniformément):

```
Page (AdvancedSettingsScreen)
├── Section Header (Typography h4, breadcrumb optionnel)
├── Card Section
│   ├── CardHeader (icon + title)
│   ├── Divider
│   └── CardContent
│       ├── FormGroup ou Stack
│       ├── Button Actions
│       └── Help Text
└── Footer (Save/Cancel buttons)
```

### Spacing & Layout
- Padding page: `3` (24px)
- Padding card: `2` (16px)
- Margin bottom sections: `4` (32px)
- Border radius: `12px` (consistant)
- Divider margin: `1` (8px)

---

## 🔐 Sécurité & Permissions

### Checklist pour tout nouvel endpoint Admin:

```javascript
// ✅ ALWAYS:
1. Vérifier le rôle: req.user.role === 'admin'
2. Logger l'action: store.LogActivity(userID, action, details)
3. Valider les inputs: sanitize & validate
4. Chiffrer les données sensibles avant stockage
5. Implémenter rate-limiting pour les bulks

// ✅ FRONTEND:
1. Vérifier la permission avant affichage
2. Disabler les boutons pour les non-admins
3. Afficher message "Accès refusé" si non-autorisé
4. Ne JAMAIS exposer d'erreurs sensibles au client
```

### Exemple d'implémentation (Go Backend):
```go
func (s *Server) handleAdminOnly(w http.ResponseWriter, r *http.Request) {
    user := r.Context().Value("user").(*domain.User)
    
    // ❌ Vérifier le rôle
    if user.Role != "admin" {
        w.WriteHeader(http.StatusForbidden)
        json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden"})
        return
    }
    
    // ✅ Logger l'action
    s.store.LogActivity(user.ID, "admin_action", map[string]interface{}{
        "action": "import_bottles",
        "timestamp": time.Now(),
    })
    
    // ✅ Process
}
```

---

## 📱 Responsive Design

### Breakpoints à respecter (MUI defaults):
- xs: 0px (Mobile)
- sm: 600px (Tablet)
- md: 960px (Desktop)
- lg: 1280px (Large Desktop)

### Adaptation de layout pour Collection:
```jsx
// ✅ GOOD:
<Grid container spacing={3}>
  <Grid item xs={12} sm={6} md={4}>
    <Card>{/* Ready to Drink */}</Card>
  </Grid>
</Grid>

// ❌ AVOID:
<Grid container>
  <Grid item xs={12}>
    <SalesDataTable /> {/* Trop "SaaS" */}
  </Grid>
</Grid>
```

---

## 🌐 Internationalisation (i18n)

### Pattern à respecter:
```jsx
const userLang = typeof navigator !== 'undefined' 
  ? navigator.language.toLowerCase() 
  : 'en';
const isFr = userLang.startsWith('fr');
const t = (fr, en) => (isFr ? fr : en);

// Utilisation:
<Typography>{t('Ma Cave', 'My Collection')}</Typography>
<Button>{t('Ajouter une bouteille', 'Add Bottle')}</Button>
```

### Traductions prioritaires (Collection):
| FR | EN |
|---|---|
| Ma Cave | My Collection |
| Analyse | Analysis |
| Mes Dégustations | My Tastings |
| Apogée | Peak Alerts |
| Gestion Avancée | Advanced Settings |
| Mon Profil | My Profile |
| À boire | Ready to Drink |
| À l'apogée | At Peak |
| Inventaire | Inventory |
| Ajouter à votre collection | Add to Collection |
| Photographier | Camera |
| Scan Code-barres | Barcode Scan |
| Ajouter manuellement | Add Manually |
| Journal de bord | Activity Journal |

---

## 🎯 Features à Éviter pour maintenir l'Identité

### ❌ Ne PAS ajouter de:
1. **Multi-tenant SaaS features**
   - Subscription plans
   - Usage quotas
   - Billing dashboard

2. **Social/Marketplace**
   - Sell bottles
   - Listings
   - Reviews from strangers

3. **Enterprise features**
   - API endpoints multiples
   - Custom branding
   - SSO/OAuth

### ✅ À la place, ajouter:
- **Personal features**
  - Sharing collections with friends/family
  - Collaborative tastings
  - Personal recommendations
  - Export & backup

- **Community features (local)**
  - Wine clubs (self-hosted)
  - Tasting notes library
  - Local tastings calendar

---

## 📊 Métriques à Tracker (non-invasive)

Pour l'Admin uniquement (pas de cloud):

```javascript
// LOCAL Metrics (SQLite):
- Total bottles in collection
- Average rating
- Most tasted region
- Bottles ready to drink
- Activity per month
- Last tasting date
```

**Jamais:**
- User tracking across sessions
- Analytics cloud
- Behavioral profiling

---

## 🧪 Testing Checklist pour Nouvelles Features

Avant de merger une nouvelle feature:

- [ ] Langage FR/EN cohérent
- [ ] Mobile/Tablet/Desktop responsive
- [ ] Permissions Admin/User correctes
- [ ] Aucune référence "SaaS" (Inventory, Stock, etc.)
- [ ] Icônes représentatives choisies
- [ ] Spacing & border-radius cohérents (12px)
- [ ] Pas d'erreurs console
- [ ] Accessible (WCAG AA minimum)
- [ ] Pas de données sensibles en logs
- [ ] Tests UX avec vrais utilisateurs

---

## 📦 Component Template pour Nouvelles Pages

```jsx
import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, CardHeader, 
  Typography, Button, TextField, Stack, Alert,
  useTheme, alpha,
} from '@mui/material';
import { SomeIcon } from '@mui/icons-material';
import api from '../services/apiClient';

/**
 * NewFeatureName - [French Name]
 * 
 * Description of what this feature does (2-3 lines)
 * Focused on Collection Privée experience
 */
const NewFeatureScreen = () => {
  const theme = useTheme();
  const userLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
  const isFr = userLang.startsWith('fr');
  const t = (fr, en) => (isFr ? fr : en);
  
  const [state, setState] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch data
      } catch (err) {
        console.error('Failed to load:', err);
        setError(t('Erreur lors du chargement', 'Failed to load'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <Box sx={{ padding: 3 }}>
      {/* Header */}
      <Box sx={{ marginBottom: 4 }}>
        <Typography variant="h4" sx={{ color: theme.palette.onSurface, fontWeight: 600 }}>
          {t('French Title', 'English Title')}
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && <Alert severity="error" sx={{ marginBottom: 2 }}>{error}</Alert>}

      {/* Content */}
      {loading ? (
        <CircularProgress />
      ) : (
        <Card sx={{ backgroundColor: theme.palette.surface }}>
          <CardHeader 
            avatar={<SomeIcon />}
            title={t('Titre', 'Title')}
          />
          <CardContent>
            {/* Your UI here */}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default NewFeatureScreen;
```

---

## 🚀 Déploiement & Maintenance

### Avant chaque release:
- [ ] Tous les texts sont FR/EN
- [ ] Pas de "Admin Panel", "Dashboard", "User Management" - utiliser le nouveau lexique
- [ ] Icônes cohérentes
- [ ] Permissions testées (Admin vs User)
- [ ] Screenshots pour release notes en FR & EN

### Backward compatibility:
- Ne pas supprimer les anciennes APIs
- Ajouter des deprecation warnings
- Supporter migration de données

---

## 📚 References Utiles

- **Design System:** Material Design 3 (MUI v5+)
- **Theme:** `web/src/theme/appTheme.js`
- **Components:** `web/src/components/`
- **Screens:** `web/src/screens/`
- **Backend API:** `cmd/api/main.go`

---

**Dernier update:** Décembre 2025  
**Maintenu par:** [Your Team]
