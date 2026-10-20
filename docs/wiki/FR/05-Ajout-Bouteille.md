# Ajouter une bouteille

## TL;DR
Ajouter une bouteille à une cave et lui assigner une catégorie.

## Prérequis
* Avoir créé au moins une **Cave**.
* Être connecté à son compte.

## Action
1. Ouvrez **Vins**, **Bulles**, **Spiritueux** ou **Cigares** dans la navigation, puis cliquez sur **+ Ajouter** (sur téléphone, le bouton rond **+**). Le formulaire s'ouvre sur cette catégorie.
2. **Étape 1 (Tronc commun)** : Vérifiez ou changez la catégorie : Vin, Bulles, Spiritueux ou Cigare.
3. Choisissez la cave de destination.
4. Saisissez le nom du produit et le producteur. Les champs proposent une **autocomplétion via Google** dès 2 caractères. Si une suggestion contient un millésime, il est extrait automatiquement dans le champ Millésime. Voir [08-Autocompletion-Image.md](./08-Autocompletion-Image.md).
5. Si une bouteille identique existe déjà dans votre cave, une alerte de **doublon** s'affiche avant la sauvegarde. Vous pouvez ignorer l'avertissement et confirmer l'ajout.
6. **Étape 2 (Options spécifiques)** : Les champs s'adaptent selon la catégorie choisie (ex: cépage pour le vin, âge pour l'alcool). Une icône **Rechercher une image** permet d'associer une photo depuis Wikimedia Commons.
7. Cliquez sur **Sauvegarder** pour ajouter la bouteille.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Résolution |
| :--- | :--- |
| **Le bouton "+" n'apparaît pas ou est désactivé** | Vous devez d'abord créer au moins une cave. Naviguez dans "Caves" et ajoutez-en une. |
| **Mauvaises suggestions (ex: cigares au lieu de vins)** | Vérifiez que la catégorie sélectionnée à l'étape 1 est bien "Vin" ou "Pétillant" et non une catégorie non-liée. |
| **Champs essentiels manquants (appellation, etc.)** | Dépliez la section optionnelle avec la flèche "Afficher plus" pour accéder aux détails poussés. |
| **Aucune suggestion d'autocomplétion** | Connexion internet requise. Voir la section dépannage de [08-Autocompletion-Image.md](./08-Autocompletion-Image.md). |
| **Alerte doublon persistante alors que ce n'est pas un doublon** | La détection compare le nom et le producteur. Si deux produits homonymes proviennent de producteurs différents, assurez-vous que le champ Producteur est distinct pour chacun. |
