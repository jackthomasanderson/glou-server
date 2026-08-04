# Activer le Mode Expert (Collectionneur)

**TL;DR** : Un interrupteur dans votre profil révèle des champs avancés (dégustation structurée, appellation, fût/batch, monitoring humidor) sur toutes les catégories d'objet. Désactivé par défaut pour tous les comptes.

## Prérequis
- Être connecté à l'application.
- Aucune configuration préalable : c'est une préférence personnelle, indépendante des caves ou des autres utilisateurs de l'instance.

## Action

1. **Ouvrir votre profil** : cliquez sur votre avatar ou allez sur `/profile`.
2. **Repérer la section "Préférences"** : carte à droite, en dessous de la sélection de couleur d'accent.
3. **Activer "Mode expert / collectionneur"** : basculez l'interrupteur en bas de la carte. L'enregistrement est automatique, sans rechargement de page.
4. **Constater l'effet, quelle que soit la catégorie de l'objet** (vin, effervescent, spiritueux, cigare) :
   - **N'importe quel objet** : le formulaire d'ajout/édition affiche une section "Champs avancés (collectionneur)" avec `Appellation`/`Classification` (ex: AOC/AOP pour un vin, IG protégée pour un Cognac ou un Scotch) et `Numéro de lot`/`Date de mise en fût ou de production`/`Type de fût`/`Numéro de fût`/`Degré au fût (%)`/`Single cask` — remplissez uniquement les champs pertinents pour votre objet, les autres restent vides sans problème.
   - **N'importe quelle dégustation** : le formulaire de dégustation affiche la section "Grille de dégustation structurée" — `Robe`, `Nez`, `Bouche` (texte libre), `Tanin` et `Acidité` (échelle 1-5), `Longueur en bouche` (en secondes), quelle que soit la catégorie de l'objet dégusté.
   - **Cigares** : en plus des champs ci-dessus, le type de cave "Humidor (cigares)" devient sélectionnable à la création/édition d'une cave, avec le panneau de monitoring hygrométrique associé — voir [Gérer mes Caves](./04-Gestion-Des-Caves.md#suivi-hygrométrique-cave-humidor).
5. **Désactiver si besoin** : rebasculez l'interrupteur. Les champs disparaissent des formulaires, mais les valeurs déjà saisies restent en base — elles réapparaissent si vous réactivez le mode expert.

> [!TIP]
> Le mode expert est un réglage par utilisateur, pas par cave ni par instance partagée. Chaque membre d'une cave partagée choisit indépendamment d'afficher ou non les champs avancés.

## Pare-feu (Troubleshooting)

| Problème | Cause Probable | Résolution |
| :--- | :--- | :--- |
| Je vois des champs qui ne semblent pas correspondre à ma catégorie (ex: `Degré au fût` sur une fiche de cigare) | Comportement attendu : depuis l'extension du mode expert à toutes les catégories, ces champs sont génériques et ne sont plus filtrés par type d'objet — libre à vous de les laisser vides s'ils ne sont pas pertinents pour ce que vous gérez. | Aucune action requise, ce n'est pas un bug. Ignorez les champs non pertinents. |
| J'ai désactivé le mode expert, mes données d'appellation/fût ont-elles été supprimées ? | Non — le gate est un choix d'affichage frontend uniquement. | Réactivez le mode expert : les valeurs saisies précédemment sont toujours là. |
| Le toggle ne semble pas se sauvegarder | Erreur réseau lors de l'appel à la mise à jour des préférences | Vérifiez votre connexion, rafraîchissez la page (F5) et réessayez. Un message de confirmation vert doit apparaître en haut de la page après activation. |
| Un autre utilisateur de ma cave partagée ne voit pas les mêmes champs que moi | Comportement attendu : le mode expert est individuel, pas partagé | Chaque utilisateur doit activer le mode expert depuis son propre profil. |
