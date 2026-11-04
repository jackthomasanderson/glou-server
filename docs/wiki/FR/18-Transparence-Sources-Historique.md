# Consulter la source d'un champ & restaurer une valeur antérieure

## TL;DR
Chaque champ de la description d'un vin peut afficher l'origine de sa valeur. Chaque modification est conservée dans l'historique du vin, avec les mouvements de ses bouteilles, et vous pouvez restaurer un champ de la description à une valeur antérieure.

## Prérequis
* Un vin (ou un cigare) ayant au moins une modification dans son historique pour voir la restauration en action.

## Action

### Vérifier l'origine d'une valeur
1. Ouvrez le vin (son tiroir).
2. Les champs remplis autrement que manuellement (**nom**, **producteur**, **millésime**, **région**, **prix d'achat**, **notes**) affichent un petit badge à côté de la valeur, avec une icône selon la source :
   - **Import CSV** : rempli via l'onboarding ou un import CSV en masse.
   - **OCR** / **Enrichissement** : réservés à de futures sources de reconnaissance automatique et d'enrichissement de données.
3. Un champ sans badge a été saisi manuellement (la saisie manuelle est la valeur par défaut implicite et n'est pas badgée).

> [!TIP]
> En pratique, seuls les badges **Import CSV** apparaissent : les pipelines OCR et enrichissement existent dans le modèle de données mais ne sont pas encore branchés sur une source active. Vous pouvez ne voir que le badge CSV, ou aucun badge.

### Consulter l'historique des modifications
1. Dans le même tiroir, ouvrez la section **Historique** (affichée uniquement si au moins une modification a été enregistrée).
2. Elle liste les modifications les plus récentes (jusqu'à 10), chacune avec l'auteur du changement, une description de ce qui a changé et la date. Elle mêle les changements de la **description** du vin et les mouvements de ses bouteilles : « Bouteilles ajoutées », « Nombre corrigé : 6 → 4 » (avec son motif), « 2 bouteilles déplacées vers Cuisine », « Prix de 2 bouteilles : 20 € → 25 € », « Vins regroupés », « Nombre vérifié ».

### Restaurer une valeur antérieure
1. Dans la section Historique, repérez le champ à restaurer et cliquez sur **Restaurer** à côté de la valeur souhaitée.

   > [!CAUTION]
   > Seule une valeur de la **description** du vin se restaure. Le niveau de remplissage (bouteille entamée), un nombre de bouteilles, un déplacement, un changement de prix et une ligne issue d'un regroupement (« Vins regroupés », ou fusionnée par la mise à jour) ne sont pas restaurables : il n'y a pas de bouton **Restaurer**. Pour revenir sur un nombre, utilisez **Ajouter des bouteilles** ou **Corriger le nombre**.

2. Confirmez dans la boîte de dialogue qui apparaît.
3. Le champ reprend immédiatement cette valeur. La restauration elle-même est enregistrée comme une nouvelle entrée d'historique (marquée comme restauration, pas comme une modification classique) afin que le journal d'audit reste exact.

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Aucun badge de source n'apparaît sur un champ que j'ai importé en CSV** | Les badges ne s'affichent que sur `name`, `producer`, `vintage`, `region`, `prix d'achat` et `notes`. Les autres colonnes ne sont pas suivies avec un badge de source. |
| **La restauration échoue avec "valeur absente de l'historique"** | La valeur que vous essayez de restaurer n'est plus dans l'historique enregistré pour ce champ (par exemple elle n'a jamais été sauvegardée comme un changement distinct). Vérifiez dans la liste Historique les valeurs disponibles à la restauration. |
| **Je ne trouve pas de bouton Restaurer pour le niveau de remplissage** | Normal : le niveau de remplissage utilise son propre curseur sur la fiche détaillée plutôt que le mécanisme historique/restauration. |
| **La section Historique n'apparaît pas du tout** | Elle reste masquée tant que le vin n'a aucune modification enregistrée. Un vin fraîchement ajouté sans édition ne l'affiche pas. |
