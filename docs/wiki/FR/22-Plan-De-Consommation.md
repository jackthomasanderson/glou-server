# Savoir quoi boire en priorité

## TL;DR
L'onglet **Plan de consommation** de Dégustations affiche une liste priorisée de bouteilles à consommer (apogée, entamées, rotation) et un objectif mensuel personnel.

## Prérequis
* Des fenêtres d'apogée renseignées (voir [06-Alertes-Apogee.md](./06-Alertes-Apogee.md)) et/ou des bouteilles entamées améliorent la pertinence des suggestions. Le plan fonctionne sans, avec une liste plus courte.

## Action

1. Allez dans **Dégustations** (`/tastings`) → onglet **Plan de consommation**.
2. Consultez la liste « À boire maintenant / prochainement ». Chaque suggestion est un **vin** (pas une bouteille par ligne) et affiche une raison : fenêtre d'apogée, bouteille entamée, ou rotation de stock. Quand une bouteille du vin est déjà entamée, le plan propose de **la finir d'abord**, avant d'en ouvrir une nouvelle.
3. Cliquez **Consommer** pour ouvrir le formulaire de dégustation pré-rempli (sur la bouteille entamée si elle existe, sinon sur la ligne que Glou présélectionne comme pour **J'en bois une**), ou **Reporter** pour retirer temporairement la suggestion de la liste (elle peut revenir plus tard si la situation du stock ne change pas).
4. Définissez un objectif mensuel : cliquez **Définir un objectif**, choisissez le type (nombre de bouteilles ou volume) et la valeur cible, puis enregistrez.
5. La barre sous l'objectif affiche votre progression et se met à jour immédiatement après chaque consommation validée.

> [!TIP]
> L'objectif est toujours calé sur le mois calendaire en cours (du 1er au dernier jour). Il n'y a pas encore de période personnalisée.

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Mon objectif ne progresse pas après une consommation** | La progression ne compte que les bouteilles finies que **vous** avez personnellement bues ce mois-ci. L'objectif est personnel, pas partagé entre les membres de l'instance. |
| **Un objectif « volume » se comporte comme un nombre de bouteilles** | Limite connue : il n'existe pas encore de champ de volume structuré dans le modèle d'inventaire, donc le volume est provisoirement compté comme un nombre de bouteilles. |
| **Une bouteille reportée réapparaît plus tard** | Attendu : le report est temporaire, pas une exclusion définitive. Les suggestions sont recalculées à chaque changement de stock ou d'apogée. |
