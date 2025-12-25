# Changelog - Collection Pivot (v0.2.0)

## 📝 Format
```
[Component] - Description
- Details
```

---

## 🎯 Major Changes

### Frontend Components

#### ✨ NEW: `CollectionDashboard.jsx`
- **Purpose**: Intimate collection dashboard with quick actions
- **Exports**: 
  - `CollectionDashboard` (main component)
  - `WineCardPreview` (sub-component)
  - `TastingCard` (sub-component)
- **Features**:
  - Welcome message + description
  - 3 quick-add buttons (Camera, Barcode, Manual)
  - 4 KPI cards (Ready to Drink, Peak, Inventory, Tastings)
  - Recent wines & tastings sections
- **Dependencies**: MUI, React Router, apiClient
- **i18n**: Full FR/EN support

#### ✨ NEW: `AdvancedSettingsScreen.jsx`
- **Purpose**: Rebranded Admin settings ("Gestion Avancée")
- **Exports**: `AdvancedSettingsScreen` (default)
- **Features**:
  - 4 configuration cards (Collection Settings, Backup, Security, Data Management)
  - Save/Load settings from API
  - Form validation & error handling
- **Dependencies**: MUI, apiClient
- **i18n**: Full FR/EN support
- **Route**: `/admin`

#### 🔄 MODIFIED: `AdaptiveNavigationShell.jsx`
- **Changes**:
  - Navigation items reorganized with sections (primary/secondary)
  - Renaming:
    - "Tableau de bord" → "Ma Cave"
    - "Analytique" → "Analyse"
    - "Historique" → "Mes Dégustations"
    - "Alertes" → "Apogée"
    - "Admin" → "Gestion Avancée"
    - "Profil" → "Mon Profil"
  - Added `section` property to nav items ("primary" / "secondary")
  - Desktop Drawer now shows primary items above, secondary items below (with Divider)
  - Icons changed: `AdminIcon` → `SettingsIcon` for "Gestion Avancée"
- **Lines Modified**: #45-86 (navigation items)

#### 🔄 MODIFIED: `DashboardScreen.jsx`
- **Changes**:
  - Completely refactored to use `CollectionDashboard`
  - Removed old KPI/SaaS components
  - Added data fetching for wines, tastings, peak alerts
  - Simplified to focus on collection insights
- **Old exports removed**: `KPIWidget`, `SaasDataTable` (kept for backward compat but not used)
- **New structure**: 
  ```
  DashboardScreen
  ├── Fetch wines/tastings
  ├── Calculate peak alerts
  └── Render CollectionDashboard
  ```

#### 🔄 MODIFIED: `App.jsx`
- **Changes**:
  - Import `AdvancedSettingsScreen`
  - Remove hardcoded `AdminScreen` placeholder
  - Route `/admin` now uses `AdvancedSettingsScreen`
- **Lines Modified**: #23, #100-106

---

## 🎨 Styling & Design

### Colors
- No new colors added (uses existing MUI palette)
- Icons changed: `AdminPanelSettings` → `Settings` for "Gestion Avancée"

### Spacing
- Consistent 12px border-radius across all cards
- Consistent padding: page=24px (3), card=16px (2)
- Consistent margin-bottom between sections: 32px (4)

### Responsive
- Mobile: Bottom navigation unchanged (5 items)
- Tablet: Navigation rail unchanged
- Desktop: Drawer now with 2 sections (divider between)

---

## 🔐 Security Changes

### Backend
- **No changes** to authentication/authorization
- Existing JWT middleware still validates all `/api/*` routes
- RBAC still enforced at handler level

### Frontend
- New `AdvancedSettingsScreen` should check `user.role === 'admin'` before display
  - **TODO**: Implement frontend permission check (useRequireRole hook)
  - **Current**: No check (backend returns 403 if user isn't admin)

---

## 🌐 i18n Changes

### New Translation Pairs
| French | English | Component |
|--------|---------|-----------|
| Ma Cave | My Collection | Navigation |
| Analyse | Analysis | Navigation |
| Mes Dégustations | My Tastings | Navigation |
| Apogée | Peak Alerts | Navigation |
| Gestion Avancée | Advanced Settings | Navigation |
| Mon Profil | My Profile | Navigation |
| Bienvenue dans votre cave | Welcome to Your Collection | Dashboard header |
| Ajouter à votre collection | Add to Collection | Dashboard section |
| Photographier | Camera | Dashboard button |
| Scan Code-barres | Barcode Scan | Dashboard button |
| Ajouter manuellement | Add Manually | Dashboard button |
| À boire | Ready to Drink | KPI card |
| À l'apogée | At Peak | KPI card |
| Inventaire | Inventory | KPI card |
| Dégustations | Tastings | KPI card |
| Configuration de la Collection | Collection Settings | Settings card |
| Sauvegarde & Export | Backup & Export | Settings card |
| Sécurité & Vie Privée | Security & Privacy | Settings card |
| Gestion des Données | Data Management | Settings card |
| (and 30+ more...) | | |

---

## 📊 API Usage (Frontend)

### New API Calls in `CollectionDashboard.jsx`
- `api.getWines()` - Fetch all bottles
- `api.getTastings?.()` - Fetch recent tastings (optional)

### New API Calls in `AdvancedSettingsScreen.jsx`
- `api.getAdminSettings?.()` - Fetch current settings
- `api.updateAdminSettings?.(settings)` - Save settings

### Existing API Calls (unchanged)
- All `/api/wines/*` routes
- All `/api/alerts/*` routes
- All `/api/tasting-history/*` routes

---

## ⚙️ Configuration

### No new environment variables needed
- Backend: `GLOU_ADDR`, `GLOU_PORT` (existing)
- Frontend: `VITE_API_URL` (existing)

### New Feature Flags (recommended for future)
```javascript
// Example (not yet implemented)
const features = {
  useNewCollectionDashboard: true,  // Use new intimate dashboard
  showAdvancedSettingsAdmin: true,   // Show "Gestion Avancée" menu
  enforceRoleBasedUI: false,         // TODO: Check user role before showing admin screens
};
```

---

## 🧪 Testing Changes

### New Test Coverage Required
- [ ] Navigation items renamed correctly (6 items)
- [ ] Desktop drawer shows divider between primary/secondary
- [ ] CollectionDashboard loads without errors
- [ ] AdvancedSettingsScreen loads (admin only)
- [ ] i18n: All new texts display in FR/EN
- [ ] Permissions: User cannot access `/admin` (backend blocks)
- [ ] Performance: Dashboard loads in < 2 seconds

### Old Tests Still Valid
- API authentication
- Database operations
- Export/Import functions

---

## 📦 Dependencies

### No new npm packages added
- Uses existing MUI v5
- Uses existing React 18
- Uses existing Vite

### No new Go packages added
- Backend untouched

---

## 🔄 Migration Guide

### For Existing Users
1. Update code: `git pull`
2. Rebuild frontend: `npm run build`
3. Restart backend: `go run main.go`
4. Clear browser cache (Ctrl+Shift+Del)
5. Navigate to http://localhost:8080

### For Existing Deployments
1. Pull latest code
2. No database changes required
3. Rebuild Docker image: `docker build -t glou .`
4. Restart container: `docker compose down && docker compose up -d`

### Backward Compatibility
- ✅ Old `/api/*` routes still work
- ✅ Old JWT tokens still valid
- ✅ Database schema unchanged
- ✅ Config files unchanged

---

## 🐛 Known Issues

### Current Limitations
- [ ] User role check not enforced at frontend (`AdvancedSettingsScreen` visible to all)
  - **Workaround**: Backend returns 403 Forbidden if not admin
  - **Fix**: Implement `useRequireRole` hook
  
- [ ] No activity log viewer on frontend
  - **Workaround**: Backend logs everything to database
  - **Fix**: Create `/admin/activity` page

- [ ] No multi-user support yet
  - **Scope**: Q2 2025
  - **Workaround**: 1 cave per deployment

---

## 🚀 Next Steps

### Immediate (v0.2.1)
- [ ] Implement frontend role-based UI (`useRequireRole` hook)
- [ ] Test AdvancedSettingsScreen on mobile/tablet
- [ ] Test i18n completely (FR/EN)
- [ ] Fix any styling issues

### Short-term (v0.3.0)
- [ ] Create `/admin/activity` page for activity logs
- [ ] Implement real import/export in AdvancedSettingsScreen
- [ ] Add data backup functionality
- [ ] User password reset flow

### Medium-term (v0.4.0+)
- [ ] Multi-user support (sharing caves with family)
- [ ] Shared tasting notes
- [ ] Mobile app integration
- [ ] Advanced analytics

---

## 📞 Questions?

See:
- `COLLECTION_PIVOT_SUMMARY.md` - High-level overview
- `GUIDELINES_COLLECTION_IDENTITY.md` - Design/code standards
- `DEVELOPER_INTEGRATION_GUIDE.md` - How to work with the code
- `TESTING_COLLECTION_PIVOT.md` - Complete test checklist

---

**Version**: 0.2.0  
**Date**: December 2025  
**Status**: ✅ Alpha (ready for testing)
