# Cycle de Vie Bouteille

## TL;DR
Opérations CRUD sur vos actifs. Inclut la suppression douce (soft-delete).

## Ajouter Bouteille
1. Sélectionner une Cave.
2. Cliquer sur **+ Ajouter Bouteille**.
3. Remplir les champs obligatoires (Nom, Millésime, Type).
4. Sauvegarder. (Mise à jour optimiste instantanée).

## Consommer / Ouvrir
- Utiliser le **Slider de Niveau** pour ajuster la quantité restante (0-100%).
- 0% déplace automatiquement l'objet vers la Corbeille.

## Corbeille & Restauration
- Les éléments supprimés vont dans la **Corbeille**.
- Pour Restaurer : Aller dans Corbeille > Cliquer l'icône **Restaurer**.
- Pour Supprimer : Aller dans Corbeille > Cliquer **Supprimer Définitivement**.

> [!NOTE]
> Tous les changements sont persistés dans PostgreSQL.
