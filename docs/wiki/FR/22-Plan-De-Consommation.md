# Savoir Quoi Boire en Priorité

## TL;DR
L'onglet **Plan de consommation** de Dégustations affiche une liste priorisée de bouteilles à consommer (apogée, entamées, rotation) et vous permet de suivre un objectif mensuel personnel.

## Prérequis
* Des fenêtres d'apogée renseignées (voir [06-Alertes-Apogee.md](./06-Alertes-Apogee.md)) et/ou des bouteilles entamées améliorent la pertinence des suggestions — le plan fonctionne même sans, avec une liste plus courte.

## Action

1. Allez dans **Dégustations** (`/tastings`) → onglet **Plan de consommation**.
2. Consultez la liste « À boire maintenant / prochainement » — chaque suggestion affiche une raison : fenêtre d'apogée, bouteille entamée, ou rotation de stock.
3. Cliquez **Consommer** pour ouvrir le formulaire de dégustation pré-rempli, ou **Reporter** pour retirer temporairement la suggestion de la liste (elle peut revenir plus tard si la situation du stock ne change pas).
4. Définissez un objectif mensuel : cliquez **Définir un objectif**, choisissez le type (nombre de bouteilles ou volume) et la valeur cible, puis enregistrez.
5. Suivez votre progression via la barre affichée sous l'objectif — mise à jour immédiatement après chaque consommation validée.

> [!TIP]
> L'objectif est toujours calé sur le mois calendaire en cours (du 1er au dernier jour) — il n'y a pas encore de période personnalisée.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Mon objectif ne progresse pas après une consommation** | La progression ne compte que les bouteilles finies (entamées à 0 %) que **vous** avez personnellement mises à jour ce mois-ci — l'objectif est personnel, pas partagé entre les membres de l'instance. |
| **Un objectif « volume » se comporte comme un nombre de bouteilles** | Limite connue : il n'existe pas encore de champ de volume structuré dans le modèle d'inventaire, donc le volume est provisoirement compté comme un nombre de bouteilles en attendant une évolution du modèle de données. |
| **Une bouteille reportée réapparaît plus tard** | Comportement normal : le report est temporaire, pas une exclusion définitive. Les suggestions sont recalculées à chaque changement de stock ou d'apogée. |
