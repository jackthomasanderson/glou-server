╔════════════════════════════════════════════════════════════════╗
║                    🧪 GUIDE DE TEST COMPLET                   ║
║                                                                ║
║      Glou Server - Gestion de Caves et Bouteilles              ║
╚════════════════════════════════════════════════════════════════╝


🎯 STATUT ACTUEL (Décembre 2025)
═══════════════════════════════════════════════════════════════

✅ Backend Go:         EN COURS (Port 8080)
✅ Frontend React:     EN COURS (Port 3000/3001)
✅ Base de données:    SQLite (local)
✅ Authentification:   JWT + Sessions

URL À TESTER:
  → http://localhost:3000/  (Frontend principal)
  → http://localhost:8080/api/health  (Santé backend)


📋 TESTS À EFFECTUER (Par ordre)
═══════════════════════════════════════════════════════════════

PHASE 1: ACCÈS & AUTHENTIFICATION (5-10 min)
─────────────────────────────────────────────

□ 1.1 - Ouvrir http://localhost:3000/
        → Devrait rediriger vers /login ou /setup
        → Vérifier: Interface responsive, logo visible

□ 1.2 - Si page /setup:
        → Remplir le formulaire initial
        → Vérifier: Admin créé, accès à l'app

□ 1.3 - Si page /login:
        → Entrer les credentials (créés en setup ou existants)
        → Vérifier: Connexion réussie, accès au dashboard

□ 1.4 - Vérifier le Dashboard (/glou)
        → Affichage des cartes d'info
        → Responsive sur mobile/desktop
        → Navigation apparente


PHASE 2: GESTION DES CAVES (15-20 min)
───────────────────────────────────────

□ 2.1 - Naviguer vers "Mes Caves"
        → Cliquer sur élément de navigation "Mes Caves"
        → Vérifier: Page chargée, tableau vide ou avec caves

□ 2.2 - Créer une nouvelle cave
        → Cliquer sur bouton "Ajouter une cave"
        → Remplir: Nom, Localisation, Capacité
        → Soumettre: Devrait apparaître dans la liste
        → Vérifier: Affichage du % de remplissage

□ 2.3 - Tester les couleurs de capacité
        → Cave à 0-50%: Devrait être VERTE
        → Cave à 50-80%: Devrait être ORANGE
        → Cave à >80%: Devrait être ROUGE
        → Ajouter des bouteilles pour tester

□ 2.4 - Modifier une cave
        → Cliquer sur le bouton "Modifier" sur une cave
        → Changer le nom/localisation
        → Sauvegarder: Devrait être mis à jour

□ 2.5 - Supprimer une cave
        → Cliquer sur le bouton "Supprimer"
        → Confirmer la suppression
        → Vérifier: Cave disparue de la liste
        ⚠️ ATTENTION: Cela peut être destructif!


PHASE 3: GESTION DES BOUTEILLES (20-25 min)
─────────────────────────────────────────────

□ 3.1 - Naviguer vers "Mes Bouteilles"
        → Cliquer sur élément de navigation "Mes Bouteilles"
        → Sélectionner une cave dans le dropdown
        → Devrait afficher les bouteilles de cette cave

□ 3.2 - Créer une nouvelle bouteille
        → Cliquer sur "Ajouter une bouteille"
        → Tester les 7 types:
           • 🍷 Vin Rouge (Red Wine)
           • 🍷 Vin Blanc (White Wine)
           • 🍷 Vin Rosé (Rosé Wine)
           • 🍷 Vin Pétillant (Sparkling Wine)
           • 🍺 Bière (Beer)
           • 🥃 Spiritueux (Spirit)
           • 🚬 Cigare (Cigar)
        → Remplir les champs: Nom, Producteur, Type
        → Ajouter: Millésime, Quantité, Prix, Note
        → Soumettre: Devrait apparaître dans la liste

□ 3.3 - Test de recherche en temps réel
        → Dans "Mes Bouteilles", taper dans la barre de recherche
        → Chercher par: Nom, Producteur, Type
        → Vérifier: Les résultats se filtrent en temps réel

□ 3.4 - Tester tous les champs de bouteille
        → Créer une bouteille COMPLÈTE avec tous les champs:
           - Nom ✓
           - Producteur ✓
           - Région ✓
           - Millésime ✓
           - Type ✓
           - Quantité ✓
           - Prix ✓
           - Note (rating) ✓
           - Commentaires ✓
           - Dates d'apogée min/max ✓
        → Vérifier: Tous les champs sauvegardés

□ 3.5 - Modifier une bouteille
        → Cliquer sur le bouton "Modifier" sur une bouteille
        → Changer quelques champs
        → Sauvegarder: Devrait être mise à jour

□ 3.6 - Supprimer une bouteille
        → Cliquer sur le bouton "Supprimer"
        → Vérifier: Bouteille disparue de la liste

□ 3.7 - Tester le changement de cave
        → Dans le dropdown "Sélectionner une cave", changer de cave
        → Devrait afficher les bouteilles d'une AUTRE cave
        → Ajouter une bouteille à cette cave
        → Revenir à la première cave: Bouteille pas présente


PHASE 4: ESPACE ADMIN (10-15 min)
──────────────────────────────────

□ 4.1 - Naviguer vers "Admin" (si rôle admin)
        → Cliquer sur "Admin" dans la navigation
        → Devrait afficher le tableau de bord admin
        → Vérifier: Cartes de statistiques visibles

□ 4.2 - Vérifier les statistiques
        → Nombre total d'utilisateurs ✓
        → Nombre total de caves ✓
        → Nombre total de bouteilles ✓
        → Nombre d'alertes actives ✓

□ 4.3 - Gérer les utilisateurs
        → Vérifier la liste des utilisateurs
        → Cliquer sur un utilisateur pour voir options
        → Si possible: Changer le rôle (admin/user)
        → Vérifier: Boutons de modification actifs

□ 4.4 - Accès restreint
        → Si rôle "user": Admin ne devrait PAS être accessible
        → Tenter d'accéder directement: Devrait être refusé
        → Vérifier: Message d'erreur approprié


PHASE 5: PROFIL UTILISATEUR (5-10 min)
───────────────────────────────────────

□ 5.1 - Naviguer vers "Mon Profil"
        → Cliquer sur "Mon Profil" dans la navigation
        → Affichage: Informations personnelles

□ 5.2 - Modifier le profil
        → Éditer Prénom et Nom
        → Vérifier: Email en lecture seule
        → Soumettre: Devrait être mis à jour

□ 5.3 - Changer le mot de passe
        → Cliquer sur "Changer le mot de passe"
        → Entrer ancien mot de passe
        → Entrer nouveau mot de passe (8+ chars)
        → Confirmer le nouveau mot de passe
        → Vérifier: Changement accepté
        → Se déconnecter et reconnecter avec nouveau password

□ 5.4 - Zone dangereuse
        → Vérifier présence du bouton "Déconnexion"
        → Cliquer: Devrait rediriger vers /login


PHASE 6: NAVIGATION & RESPONSIVE (5-10 min)
─────────────────────────────────────────────

□ 6.1 - Tester le responsive
        → F12 → Mode responsive (Mobile 375px)
        → Vérifier: Navigation en bas (BottomNav)
        → Tester sur 600px (Tablet): Navigation latérale
        → Tester sur 1200px (Desktop): Drawer

□ 6.2 - Tester toutes les routes
        → /glou       → Dashboard ✓
        → /caves      → Gestion caves ✓
        → /bottles    → Gestion bouteilles ✓
        → /admin      → Admin (si rôle admin) ✓
        → /profile    → Mon Profil ✓
        → /analytics  → Analytics (si existe)
        → /settings   → Paramètres (si existe)

□ 6.3 - Vérifier les icônes de navigation
        → Chaque route devrait avoir une icône
        → Icônes cohérentes et visibles
        → Animations smooth au changement


PHASE 7: MULTILINGUE (FR/EN) (5 min)
─────────────────────────────────────

□ 7.1 - Vérifier la détection de langue
        → Langue du navigateur = langue de l'app
        → Browser: EN → App: EN
        → Browser: FR → App: FR

□ 7.2 - Vérifier la couverture i18n
        → Tous les textes de l'interface sont traduits
        → Pas de clés de traduction visibles (ex: "bottles.list")
        → Tous les boutons ont du texte traduit

□ 7.3 - Test des 7 types de bouteilles (i18n)
        → Changer le type → Vérifier le texte traduit
        → Vérifier pour chaque type en FR et EN


PHASE 8: PERFORMANCE & SÉCURITÉ (5-10 min)
────────────────────────────────────────────

□ 8.1 - Tester la performance
        → Créer 20 bouteilles
        → Chercher dans la liste: Devrait être rapide
        → Page devrait rester responsive

□ 8.2 - Vérifier la sécurité
        → Ouvrir les DevTools (F12)
        → Vérifier les headers HTTP:
           • X-Frame-Options: DENY
           • X-Content-Type-Options: nosniff
           • X-XSS-Protection: 1; mode=block
        → Onglet Network: Vérifier les requêtes authentifiées

□ 8.3 - Tester l'authentification manquante
        → Logout
        → Aller directement à http://localhost:3000/bottles
        → Devrait rediriger vers /login

□ 8.4 - Vérifier les données en base
        → Les données persistent après refresh
        → Les données persistent après reconnexion
        → Pas de data visible sans authentification


✅ RÉSULTATS DES TESTS
═══════════════════════════════════════════════════════════════

Scorer your testing:

□ Tous les tests PHASE 1 OK   → Authentification ✅
□ Tous les tests PHASE 2 OK   → Caves ✅
□ Tous les tests PHASE 3 OK   → Bouteilles ✅
□ Tous les tests PHASE 4 OK   → Admin ✅
□ Tous les tests PHASE 5 OK   → Profil ✅
□ Tous les tests PHASE 6 OK   → Navigation ✅
□ Tous les tests PHASE 7 OK   → i18n ✅
□ Tous les tests PHASE 8 OK   → Perf/Sécurité ✅

Score: ___ / 8 phases


🐛 EN CAS DE PROBLÈME
═══════════════════════════════════════════════════════════════

❌ Page blanche / Ne charge pas:
   → Ouvrir DevTools (F12) → Console
   → Vérifier les erreurs JavaScript
   → Vérifier que le backend répond: curl http://localhost:8080/api/health

❌ Erreur 401 / Non authentifiée:
   → Vérifier le token JWT en localStorage
   → DevTools → Application → localStorage → glou_token
   → Si vide: Réesayer la connexion

❌ Erreur CORS / Cannot GET:
   → Backend pas à l'écoute sur 8080
   → Vérifier: netstat -ano | findstr :8080
   → Redémarrer: go build -o glou-server.exe ./cmd/api && .\glou-server.exe

❌ Frontend ne charge pas:
   → Node.js pas actif
   → Vérifier: npm run dev dans le dossier web/
   → Port 3000 en usage? Changer: npm run dev --port 3001

❌ Base de données vide:
   → Vérifier: data/glou.db existe
   → Ou: Faire le setup initial si première exécution

❌ Données ne sauvegardent pas:
   → Vérifier les erreurs backend: Voir les logs
   → Vérifier la requête POST dans DevTools Network
   → Vérifier le code d'erreur HTTP (40x, 50x)


📞 SUPPORT
═══════════════════════════════════════════════════════════════

Questions fréquentes:
  1. Comment obtenir des droits admin?
     → Créer le premier utilisateur lors du setup
     → Cet utilisateur est automatiquement admin

  2. Comment créer d'autres utilisateurs?
     → Via l'interface Admin (si vous êtes admin)
     → Ou: Via la page de inscription (si activée)

  3. Comment réinitialiser la base de données?
     → Supprimer data/glou.db
     → Redémarrer le serveur
     → Le setup réapparaîtra

  4. Comment changer le port du backend?
     → Modifier cmd/api/config.go ou la variable d'environnement PORT
     → Redémarrer le serveur

  5. Les données de test disparaissent après redémarrage?
     → C'est normal si vous utilisez la DB en mémoire
     → Vérifier que data/glou.db existe et grandit


═══════════════════════════════════════════════════════════════
                 🎊 BONNE SESSION DE TEST! 🎊
═══════════════════════════════════════════════════════════════

Url pour démarrer:       http://localhost:3000/
Logins test:            (Créés lors du setup)
Backend health check:   http://localhost:8080/api/health
Documentation:          Voir README_CHANGES.md

═══════════════════════════════════════════════════════════════
