# Plan de Test - "Personal & Family Collection" Pivot

## Objectif
Valider que le pivot vers une identité "Collection Privée" maintient l'intégrité des permissions **Admin/User** sans alourdir l'expérience utilisateur.

---

## 1. Tests de Navigation et Accessibilité

### 1.1 Navigation Mobile (< 600px)
- [ ] Les 4 premiers éléments (Ma Cave, Analyse, Mes Dégustations, Apogée) sont dans la BottomNavigation
- [ ] "Gestion Avancée" et "Mon Profil" ne sont PAS visibles dans la BottomNavigation (accès via menu caché ou compte uniquement)
- [ ] Tous les liens fonctionnent sans erreur 404

### 1.2 Navigation Tablet (600px - 960px)
- [ ] Navigation Rail affiche les 4 premiers items de manière compacte
- [ ] Icônes lisibles et représentatives
- [ ] Gestion Avancée est discrètement accessible (section secondaire)

### 1.3 Navigation Desktop (> 960px)
- [ ] Drawer permanent affiche 4 items prioritaires au-dessus
- [ ] Une ligne séparatrice (Divider) précède les items secondaires
- [ ] "Gestion Avancée" et "Mon Profil" au bas du drawer
- [ ] Le courant item reste surligné

---

## 2. Tests des Rôles et Permissions

### 2.1 Accès Utilisateur Standard (Role: User)
**Route: /dashboard**
- [ ] L'utilisateur voit le CollectionDashboard avec:
  - [ ] "À boire" (Ready to Drink count)
  - [ ] "À l'apogée" (Peak Alerts count)
  - [ ] "Inventaire" (Total bottles)
  - [ ] "Dégustations" (Recent tastings)
  - [ ] 3 boutons d'actions rapides (Photographier, Scan Code-barres, Ajouter manuellement)
- [ ] Les widgets s'affichent sans données d'admin

**Route: /analytics**
- [ ] L'utilisateur voit les heatmaps et statistiques de sa cave
- [ ] Pas d'accès à des statistiques multi-utilisateurs ou globales

**Route: /alerts**
- [ ] Affichage des alertes personnelles uniquement (Apogée, à boire, stockage)

**Route: /tasting-history**
- [ ] Affichage des dégustations personnelles uniquement

**Route: /admin**
- [ ] Redirection vers /dashboard ou message "Accès refusé"
- [ ] Pas d'erreur console

### 2.2 Accès Administrateur (Role: Admin)
**Route: /admin (Gestion Avancée)**
- [ ] Tous les panneaux visibles:
  - [ ] Configuration de la Collection (Nom, Description, Image Recognition)
  - [ ] Sauvegarde & Export (Backup auto, Export CSV)
  - [ ] Sécurité & Vie Privée (Affichage du mode de chiffrement AES-256-GCM)
  - [ ] Gestion des Données (Import JSON/CSV, Delete All)
- [ ] Les boutons "Importer" et "Exporter" sont fonctionnels (mock ou vraies fonctions selon implémentation)
- [ ] Les paramètres se sauvegardent sans erreur

**Route: /admin + /settings/users** (Futur)
- [ ] Admin voit les utilisateurs de la cave
- [ ] Admin peut gérer les rôles (si applicable)

---

## 3. Tests de Langage (i18n)

### 3.1 Français (navigator.language = fr-FR)
- [ ] "Ma Cave" au lieu de "Dashboard"
- [ ] "Analyse" au lieu de "Analytics"
- [ ] "Mes Dégustations" au lieu de "History"
- [ ] "Apogée" au lieu de "Alerts"
- [ ] "Gestion Avancée" au lieu de "Admin"
- [ ] "Mon Profil" au lieu de "Profile"
- [ ] Tous les boutons d'actions: "Photographier", "Scan Code-barres", "Ajouter manuellement"
- [ ] Dashboard titre: "Bienvenue dans votre cave"

### 3.2 Anglais (navigator.language = en-US)
- [ ] "My Collection" au lieu de "Dashboard"
- [ ] "Analysis" au lieu de "Analytics"
- [ ] "Tastings" au lieu de "History"
- [ ] "Peak Alerts" au lieu de "Alerts"
- [ ] "Advanced Settings" au lieu de "Admin"
- [ ] "My Profile" au lieu de "Profile"
- [ ] Tous les boutons d'actions: "Camera", "Barcode", "Manual Add"
- [ ] Dashboard titre: "Welcome to Your Collection"

---

## 4. Tests de Design et UX

### 4.1 CollectionDashboard
- [ ] Gradient ou dégradé accueillant sur la section "Ajouter à votre collection"
- [ ] 4 cartes KPI avec icônes et couleurs différentes:
  - [ ] "À boire" → Icône verre + couleur success/vert
  - [ ] "À l'apogée" → Icône alerte + couleur warning/orange
  - [ ] "Inventaire" → Icône trending-up + couleur primary
  - [ ] "Dégustations" → Icône cœur + couleur tertiary
- [ ] Les cartes "Prêt à boire" et "Dégustations récentes" affichent les détails sans erreur
- [ ] Pas de dépassement d'écran (responsive)

### 4.2 AdvancedSettingsScreen
- [ ] Structure avec cards colorées par thème (Settings/Backup/Security/Data)
- [ ] Switch et TextFields bien alignés
- [ ] Bouton "Enregistrer les modifications" au bas avec SaveIcon
- [ ] Message de succès apparaît après sauvegarde (3 secondes)

---

## 5. Tests Backend - Routes API

### 5.1 Middleware d'Authentification
- [ ] Routes `/api/*` requièrent un JWT valide
- [ ] JWT invalide → erreur 401 Unauthorized
- [ ] Pas de JWT → redirection vers login

### 5.2 Contrôle d'accès par Rôle (RBAC)
- [ ] User peut appeler: `/wines`, `/alerts`, `/tasting-history`, `/analytics`
- [ ] User CANNOT appeler: `/admin/settings`, `/admin/users`, `/admin/import`
- [ ] Admin peut appeler TOUS les endpoints

### 5.3 Journalisation d'Activité
- [ ] Les actions Admin (Import, Settings update) sont loggées
- [ ] Les actions User (Add wine, Tasting) sont loggées
- [ ] Logs accessibles via `/admin/activity` (future implémentation)

---

## 6. Tests de Sécurité

### 6.1 Chiffrement des Données
- [ ] Les données sensibles (notes personnelles, etc.) sont chiffrées en base de données
- [ ] Vérifier via l'écran Gestion Avancée que le message affiche "AES-256-GCM"

### 6.2 Souveraineté des Données
- [ ] L'application fonctionne en mode hors ligne (données locales SQLite)
- [ ] Aucun appel externe sans consentement explicite (ex: enrichment image-recognition opt-in)

### 6.3 Gestion de Session
- [ ] Session JWT expire après 24 heures
- [ ] Logout efface la session
- [ ] Rechargement de page maintient la session (localStorage/sessionStorage)

---

## 7. Tests de Performance

### 7.1 Chargement des Écrans
- [ ] Dashboard charge en < 2 secondes (avec 100+ bouteilles)
- [ ] Analytics charge sans lag visible
- [ ] Images de bouteilles chargent progressivement (lazy loading)

### 7.2 Gestion d'Accès en Masse
- [ ] Import de 1000 bouteilles via CSV fonctionne sans crash
- [ ] Export de 1000 bouteilles en < 5 secondes

---

## 8. Tests de Cas Limites

### 8.1 Utilisateur sans bouteilles
- [ ] Dashboard affiche "0" dans tous les KPI
- [ ] Message incitatif pour l'ajout première bouteille

### 8.2 Utilisateur sans dégustations
- [ ] Section "Mes dernières dégustations" vide mais visible
- [ ] Lien vers "Ajouter une dégustation" disponible

### 8.3 Navigation avec permissions manquantes
- [ ] User essaie d'accéder à `/admin` → Redirection gracieuse
- [ ] Admin essaie d'accéder à `/user` (Profile) → OK

---

## 9. Critères de Succès

✅ **TOUS les tests de navigation réussissent sur mobile, tablet, desktop**

✅ **Les rôles Admin/User sont correctement implémentés sans exposer des fonctionnalités privées**

✅ **Le langage français/anglais est cohérent et fluide**

✅ **L'interface transmet l'identité "Collection Privée" (intime, passion, data souveraineté)**

✅ **Aucune erreur console lors des tests**

✅ **Performance acceptables (chargement < 2s, responsive < 100ms)**

---

## 10. Commandes de Test Manuel (PowerShell)

```powershell
# Vérifier que le frontend compile
cd web
npm run build
npm start

# Vérifier le backend
cd ../cmd/api
go run main.go

# Tester l'authentification (via curl ou Postman)
# 1. Login
# 2. Récupérer JWT
# 3. Appeler /api/wines avec et sans JWT
# 4. Tester /admin/settings avec User role (doit échouer)
# 5. Tester /admin/settings avec Admin role (doit réussir)
```

---

## Prochaines Étapes (Après Test)

- [ ] Créer page /admin/activity pour afficher le journal d'activité
- [ ] Implémenter système de partage de cave (Multi-user avec rôles)
- [ ] Ajouter notifications push pour les alerts apogée
- [ ] Dashboard widget personnalisé (widgets glissable/resizable)
- [ ] Thème sombre optionnel
