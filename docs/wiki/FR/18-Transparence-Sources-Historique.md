# Consulter la Source d'un Champ & Restaurer une Valeur Antérieure

## TL;DR
Chaque champ de la fiche détaillée d'un actif peut afficher l'origine de sa valeur, et chaque modification est conservée dans un historique par actif permettant de restaurer un champ à une valeur antérieure.

## Prérequis
* Un actif (bouteille ou cigare) ayant au moins une modification dans son historique pour voir la restauration en action.

## Action

### Vérifier l'origine d'une valeur
1. Ouvrez la fiche détaillée d'un actif.
2. Les champs remplis autrement que manuellement (**nom**, **producteur**, **millésime**, **région**, **prix d'achat**, **notes**) affichent un petit badge à côté de la valeur, avec une icône selon la source :
   - **Import CSV** — rempli via l'onboarding ou un import CSV en masse.
   - **OCR** / **Enrichissement** — réservés à de futures sources de reconnaissance automatique et d'enrichissement de données.
3. Un champ sans badge a été saisi manuellement (la saisie manuelle est la valeur par défaut implicite et n'est pas badgée).

> [!TIP]
> En pratique, aujourd'hui, seuls les badges **Import CSV** apparaissent réellement — les pipelines OCR et enrichissement existent dans le modèle de données mais ne sont pas encore branchés sur une source active. Ne soyez pas surpris de ne voir que le badge CSV, ou aucun badge du tout.

### Consulter l'historique des modifications
1. Sur la même fiche détaillée, ouvrez la section **Historique** (affichée uniquement si au moins une modification a été enregistrée).
2. Elle liste les modifications les plus récentes (jusqu'à 10), chacune avec l'auteur du changement, une description de ce qui a changé et la date.

### Restaurer une valeur antérieure
1. Dans la section Historique, repérez le champ à restaurer et cliquez sur **Restaurer** à côté de la valeur souhaitée.

   > [!CAUTION]
   > Le niveau de remplissage (bouteille entamée) n'est pas restaurable depuis cet endroit — il dispose de son propre curseur dédié.

2. Confirmez dans la boîte de dialogue qui apparaît.
3. Le champ reprend immédiatement cette valeur, et la restauration elle-même est enregistrée comme une nouvelle entrée d'historique (marquée comme restauration, pas comme une modification classique) afin que le journal d'audit reste exact.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Aucun badge de source n'apparaît sur un champ que j'ai importé en CSV** | Les badges ne s'affichent que sur `name`, `producer`, `vintage`, `region`, `prix d'achat` et `notes`. Les autres colonnes ne sont pas suivies avec un badge de source. |
| **La restauration échoue avec "valeur absente de l'historique"** | La valeur que vous essayez de restaurer n'est plus dans l'historique enregistré pour ce champ (par exemple elle n'a jamais été réellement sauvegardée comme un changement distinct). Vérifiez dans la liste Historique la valeur exacte disponible à la restauration. |
| **Je ne trouve pas de bouton Restaurer pour le niveau de remplissage** | Normal — le niveau de remplissage utilise son propre curseur sur la fiche détaillée plutôt que le mécanisme historique/restauration. |
| **La section Historique n'apparaît pas du tout** | Elle reste masquée tant que l'actif n'a aucune modification enregistrée. Un actif fraîchement ajouté sans édition ne l'affichera pas. |
