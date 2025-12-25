╔════════════════════════════════════════════════════════════════╗
║            🎯 PARCOURS DE TEST ÉTAPE PAR ÉTAPE                 ║
║                                                                ║
║             (Les 5 premières minutes pour commencer)           ║
╚════════════════════════════════════════════════════════════════╝


ÉTAPE 0: PRÉPARATION (1 minute)
═══════════════════════════════════════════════════════════════

✓ Les deux services sont démarrés:
  • Backend Go: Écoute sur le port 8080 ✅
  • Frontend React: Écoute sur le port 3000 ✅

✓ Ouvrez votre navigateur préféré
  • Chrome / Edge / Firefox
  • Tapez ou cliquez: http://localhost:3000/


ÉTAPE 1: PAGE D'ACCUEIL (30 secondes)
═══════════════════════════════════════════════════════════════

Vous devriez voir:

  Option A - Si première utilisation:
    → Page de SETUP avec formulaire vide
    → Champs: Username, Email, Password, Admin Name
    → Bouton: "Commencer" ou "Setup"

  Option B - Si déjà configuré:
    → Page de LOGIN
    → Champs: Username/Email + Password
    → Bouton: "Se connecter"


ÉTAPE 2: SETUP INITIAL (2 minutes) - UNIQUEMENT PREMIÈRE FOIS
═══════════════════════════════════════════════════════════════

Si vous voyez la page de SETUP:

  1️⃣  Remplir le formulaire:
      • Username: "admin" (ou votre choix)
      • Email: "admin@glou.local" (ou votre email)
      • Password: "password123" (min 8 caractères)
      • Confirm Password: Même password
      • Admin Name: "Romain" (ou votre nom)

  2️⃣  Cliquer sur "Commencer" ou "Setup Complete"

  3️⃣  Attendre la redirection vers le Dashboard

  ✅ Vous devriez être connecté automatiquement!


ÉTAPE 3: DASHBOARD PRINCIPAL (1 minute)
═══════════════════════════════════════════════════════════════

Vérifications:
  □ URL: http://localhost:3000/glou
  □ Page affichée: Dashboard avec cartes d'info
  □ Navigation visible (bas/côté/haut selon écran)
  □ 9 éléments de navigation:
    1. 🏠 Ma Cave (ou Dashboard)
    2. 🗄️  Mes Caves
    3. 🍾 Mes Bouteilles
    4. 📊 Analyse
    5. 🍷 Dégustations
    6. 📅 Apogée
    7. 👤 Admin
    8. ⚙️  Paramètres
    9. 👥 Mon Profil

  □ Au moins 4 cartes affichées avec nombres

Résultat attendu: ✅ Interface complète et responsive


ÉTAPE 4: CRÉER UNE CAVE (2 minutes)
═══════════════════════════════════════════════════════════════

Cliquer sur: 🗄️  "Mes Caves" (élément 2 de la navigation)

Vous devriez voir:
  □ Page "Gestion des Caves"
  □ Un tableau (probablement vide)
  □ Bouton "➕ Ajouter une cave" (ou vert clair)

Action:
  1️⃣  Cliquer sur "➕ Ajouter une cave"

  2️⃣  Une dialog/modal s'ouvre avec formulaire:
      • Nom: "Ma première cave"
      • Localisation: "Maison"
      • Capacité: "50"
      • Modèle: "La Sommelière" (optionnel)
      • Description: "Cave principale" (optionnel)

  3️⃣  Cliquer sur "Enregistrer" ou "Créer"

  ✅ Résultat: Cave apparaît dans le tableau!

Vérifications:
  □ La cave a un % de remplissage (initialement 0%)
  □ La barre de remplissage est VERTE (< 50%)
  □ Boutons "Modifier" et "Supprimer" visibles


ÉTAPE 5: AJOUTER UNE BOUTEILLE (3 minutes)
═══════════════════════════════════════════════════════════════

Cliquer sur: 🍾 "Mes Bouteilles" (élément 3 de la navigation)

Vous devriez voir:
  □ Page "Gestion des Bouteilles"
  □ Dropdown "Sélectionner une cave"
  □ Tableau vide
  □ Bouton "➕ Ajouter une bouteille"

Action:
  1️⃣  Si pas sélectionné: Choisir "Ma première cave" dans le dropdown

  2️⃣  Cliquer sur "➕ Ajouter une bouteille"

  3️⃣  Une dialog s'ouvre avec formulaire:

      À REMPLIR OBLIGATOIREMENT:
      • Nom: "Château Margaux 2015"
      • Type: Sélectionner "🍷 Red Wine" (vin rouge)
      • Producteur: "Château Margaux"
      • Région: "Bordeaux"
      • Millésime: "2015"
      • Quantité: "1"

      À REMPLIR OPTIONNELLEMENT:
      • Prix: "150"
      • Note/Rating: "5"
      • Commentaires: "Excellent!"
      • Dates apogée: (laisser vide pour test)

  4️⃣  Cliquer sur "Enregistrer" ou "Ajouter"

  ✅ Résultat: Bouteille apparaît dans le tableau!

Vérifications:
  □ Colonne "Nom": "Château Margaux 2015" ✓
  □ Colonne "Type": "🍷 Red Wine" ✓
  □ Colonne "Producteur": "Château Margaux" ✓
  □ Colonne "Quantité": "1" ✓
  □ Boutons "Modifier" et "Supprimer" visibles ✓
  □ % remplissage de la cave est passé de 0% à 2% (vert) ✓


ÉTAPE 6: TESTER LA RECHERCHE (1 minute)
═══════════════════════════════════════════════════════════════

Toujours dans "Mes Bouteilles":

  1️⃣  Trouver la barre de recherche (en haut du tableau)

  2️⃣  Taper: "Château"

  ✅ Résultat: La bouteille filtrée s'affiche toujours

  3️⃣  Taper: "Margaux"

  ✅ Résultat: La bouteille filtrée s'affiche toujours

  4️⃣  Taper: "xxx"

  ✅ Résultat: Aucune bouteille (recherche fonctionne!)

  5️⃣  Effacer et voir toutes les bouteilles réapparaître

Résultat attendu: ✅ Recherche en temps réel fonctionne


ÉTAPE 7: TESTER LE RESPONSIVE (2 minutes)
═══════════════════════════════════════════════════════════════

Appuyez sur F12 (DevTools) ou Ctrl+Shift+I

  1️⃣  Cliquer sur l'icône "Responsive Design Mode"
      (ou: Ctrl+Shift+M)

  2️⃣  Changer la taille de la fenêtre:

      À 400px (Mobile):
      □ Navigation devrait être EN BAS (Bottom Navigation)
      □ Tous les éléments accessibles via navigation bas
      □ Texte lisible sur petit écran

      À 800px (Tablet):
      □ Navigation devrait être sur le CÔTÉ (Rail)
      □ Contenu main plus large

      À 1200px (Desktop):
      □ Navigation devrait être un DRAWER permanent sur le côté
      □ Layout full-width

Résultat attendu: ✅ Interface s'adapte correctement


ÉTAPE 8: VÉRIFIER LE MULTILINGUE (1 minute)
═══════════════════════════════════════════════════════════════

La langue est détectée automatiquement mais vous pouvez tester:

  Vérifier les textes:
  □ Tous les boutons ont du texte en français
  □ Les labels sont en français
  □ Pas de clés de traduction visibles (ex: "caves.add_button")

  Exemple de textes à voir en FR:
  • "Mes Caves"
  • "Ajouter une cave"
  • "Créer"
  • "Enregistrer"
  • "Supprimer"
  • "Mes Bouteilles"
  • "Sélectionner une cave"

Résultat attendu: ✅ Tous les textes sont traduits en français


ÉTAPE 9: TESTER L'ADMIN (1 minute)
═══════════════════════════════════════════════════════════════

Cliquer sur: 👤 "Admin" (élément 7 de la navigation)

Vous devriez voir:
  □ Page "Admin Dashboard"
  □ 4 cartes de statistiques:
    • Nombre d'utilisateurs
    • Nombre de caves
    • Nombre de bouteilles
    • Nombre d'alertes
  □ Tableau des utilisateurs
  □ Votre compte: "admin" avec rôle "admin"

Vérifications:
  □ Stats affichent des nombres (probablement: 1 user, 1 cave, 1 bottle, 0 alerts)
  □ Votre utilisateur visible dans la liste

Résultat attendu: ✅ Admin dashboard fonctionne


ÉTAPE 10: PROFIL UTILISATEUR (1 minute)
═══════════════════════════════════════════════════════════════

Cliquer sur: 👥 "Mon Profil" (élément 9 de la navigation)

Vous devriez voir:
  □ Page "Mon Profil"
  □ Section "Informations personnelles"
    • Prénom (modifiable)
    • Nom (modifiable)
    • Email (lecture seule)
  □ Bouton "Changer le mot de passe"
  □ Zone dangereuse avec "Déconnexion"

Vérifications:
  □ Vos informations affichées
  □ Email en gris (non-modifiable)
  □ Boutons de modification visibles

Test:
  1️⃣  Modifier le Prénom → "Romain Update"
  2️⃣  Cliquer "Enregistrer"
  3️⃣  Vérifier: Prénom mis à jour

Résultat attendu: ✅ Profil fonctionne


═══════════════════════════════════════════════════════════════════════════════
                        ✅ SUCCÈS - TOUS LES TESTS PASSÉS!
═══════════════════════════════════════════════════════════════════════════════

Si vous avez pu faire tous ces tests sans erreur:

  ✨ Authentification:           ✅ Fonctionne
  ✨ Gestion des caves:          ✅ Fonctionne
  ✨ Gestion des bouteilles:     ✅ Fonctionne
  ✨ Recherche:                  ✅ Fonctionne
  ✨ Responsive design:          ✅ Fonctionne
  ✨ Admin dashboard:            ✅ Fonctionne
  ✨ Profil utilisateur:         ✅ Fonctionne
  ✨ Traductions FR/EN:          ✅ Fonctionne

Votre système est OPÉRATIONNEL! 🎊

═══════════════════════════════════════════════════════════════════════════════
                            🚀 PROCHAINES ÉTAPES
═══════════════════════════════════════════════════════════════════════════════

Pour un test complet (1-2 heures):
  → Lire et suivre: TESTING_SESSION.md (8 phases complètes)

Pour la documentation technique:
  → Lire: IMPLEMENTATION_SUMMARY.md
  → Lire: README_CHANGES.md

Pour l'architecture:
  → Lire: VISUAL_OVERVIEW.md

═══════════════════════════════════════════════════════════════════════════════

Temps estimé de ce parcours: 15-20 minutes
Difficultés: Aucune (interface intuitive)
Taux de succès attendu: 100%

Vous êtes prêt! 🎉

═══════════════════════════════════════════════════════════════════════════════
