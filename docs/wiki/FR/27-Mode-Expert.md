# Activer le Mode Expert (Collectionneur)

**TL;DR** : Un interrupteur dans votre profil révèle des champs avancés (dégustation structurée, appellation, fût/batch spiritueux, monitoring humidor) filtrés selon la catégorie de l'objet. Désactivé par défaut pour tous les comptes.

## Prérequis
- Être connecté à l'application.
- Aucune configuration préalable : c'est une préférence personnelle, indépendante des caves ou des autres utilisateurs de l'instance.

## Action

1. **Ouvrir votre profil** : cliquez sur votre avatar ou allez sur `/profile`.
2. **Repérer la section "Préférences"** : carte à droite, en dessous de la sélection de couleur d'accent.
3. **Activer "Mode expert / collectionneur"** : basculez l'interrupteur en bas de la carte. L'enregistrement est automatique, sans rechargement de page.
4. **Constater l'effet selon ce que vous gérez** :
   - **Bouteille de vin** (catégorie "Vin" uniquement) : le formulaire d'ajout/édition d'une bouteille affiche une section "Dégustation avancée" avec les champs `Appellation` et `Classification`.
   - **Dégustation d'un vin** (catégorie "Vin" uniquement) : le formulaire de dégustation affiche la section "Grille de dégustation structurée" — `Robe`, `Nez`, `Bouche` (texte libre), `Tanin` et `Acidité` (échelle 1-5), `Longueur en bouche` (en secondes).
   - **Spiritueux** : le formulaire d'ajout/édition affiche la section "Fût & batch (collectionneur)" — `Numéro de lot`, `Date de mise en fût / d'embouteillage du lot`, `Type de fût`, `Numéro de fût`, `Degré au fût (%)`, et un chip à bascule `Single cask`.
   - **Cigares** : le type de cave "Humidor (cigares)" devient sélectionnable à la création/édition d'une cave, avec le panneau de monitoring hygrométrique associé — voir [Gérer mes Caves](./04-Gestion-Des-Caves.md#suivi-hygrométrique-cave-humidor).
5. **Désactiver si besoin** : rebasculez l'interrupteur. Les champs disparaissent des formulaires, mais les valeurs déjà saisies restent en base — elles réapparaissent si vous réactivez le mode expert.

> [!TIP]
> Le mode expert est un réglage par utilisateur, pas par cave ni par instance partagée. Chaque membre d'une cave partagée choisit indépendamment d'afficher ou non les champs avancés.

## Pare-feu (Troubleshooting)

| Problème | Cause Probable | Résolution |
| :--- | :--- | :--- |
| Le formulaire d'un vin effervescent (Champagne, Crémant...) n'affiche pas la section "Dégustation avancée" ni la grille de dégustation structurée, même avec le mode expert actif | Comportement réel du code : ces sections ne se déclenchent que pour la catégorie exacte "Vin". La catégorie "Effervescent" en est exclue à ce jour. | Aucune action possible côté utilisateur — ce n'est pas un bug de configuration. Si vous devez consigner une note de dégustation détaillée sur un effervescent, utilisez les champs de dégustation standard (notes/commentaire libres). |
| J'ai activé le mode expert mais je ne vois aucun champ supplémentaire sur ma fiche cigare | Comportement attendu : les cigares n'ont pas de champs avancés sur `InventoryItem`. Le mode expert révèle uniquement le type de cave "Humidor" et son panneau de monitoring, pas de champs sur l'objet cigare lui-même. | Vérifiez plutôt la fiche de la cave (si elle est de type Humidor) pour voir le panneau de monitoring hygrométrique. |
| J'ai désactivé le mode expert, mes données d'appellation/fût ont-elles été supprimées ? | Non — le gate est un choix d'affichage frontend uniquement. | Réactivez le mode expert : les valeurs saisies précédemment sont toujours là. |
| Le toggle ne semble pas se sauvegarder | Erreur réseau lors de l'appel à la mise à jour des préférences | Vérifiez votre connexion, rafraîchissez la page (F5) et réessayez. Un message de confirmation vert doit apparaître en haut de la page après activation. |
| Un autre utilisateur de ma cave partagée ne voit pas les mêmes champs que moi | Comportement attendu : le mode expert est individuel, pas partagé | Chaque utilisateur doit activer le mode expert depuis son propre profil. |
