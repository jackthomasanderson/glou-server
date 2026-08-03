# Planifier ses Achats et Suivre son Budget Cave

## TL;DR
Ajoutez les bouteilles que vous convoitez avec un prix plafond, suivez vos enveloppes budgétaires par période, et basculez un souhait vers l'inventaire dès qu'il est acquis.

## Prérequis
* Aucun — fonctionne indépendamment de l'inventaire existant.

## Action

1. Ouvrez **Souhaits & Budget** dans la barre latérale.
2. Onglet **Souhaits** : cliquez **Ajouter un souhait**, renseignez nom, producteur, catégorie, quantité cible et prix plafond (optionnel — vous serez notifié si un prix observé lui est inférieur ou égal).
3. Pour noter un prix constaté (saisie manuelle — aucune source de prix externe n'est connectée), ouvrez **Marquer un prix observé** sur le souhait concerné. Si le prix saisi est sous le plafond, une opportunité est signalée immédiatement dans le dialogue.
4. Une fois l'article acheté, cliquez **Basculer vers l'inventaire** : complétez prix d'achat, lieu d'achat, cave de destination et format, puis validez. L'item est créé dans l'inventaire partagé et le souhait passe au statut « Acquis ».
5. Onglet **Budget** : cliquez **Définir une enveloppe**, indiquez une période (début/fin) et un montant. Le montant dépensé se calcule à partir de vos propres achats sur la période, et une barre affiche dépensé/restant.

> [!TIP]
> Les souhaits et budgets sont **personnels** : chaque membre de l'instance gère sa propre liste et son propre suivi budgétaire, à la différence de l'inventaire qui reste partagé entre tous les membres.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Le prix plafond n'a déclenché aucune alerte** | Aucune veille automatique de prix n'existe (pas de connecteur tiers) — l'opportunité n'est détectée qu'au moment où vous saisissez manuellement un prix via « Marquer un prix observé ». |
| **Mon budget affiche 0 € dépensé alors que j'ai acheté des bouteilles** | Seuls les achats que **vous** avez personnellement enregistrés sur la période comptent — le budget est un suivi personnel, pas un agrégat de toute l'instance. |
| **Impossible de modifier une enveloppe déjà créée** | L'édition d'une enveloppe existante n'est pas encore disponible dans l'interface (seules création et suppression le sont). Supprimez et recréez l'enveloppe pour corriger un montant. |
| **Un souhait « Annulé » reste visible dans la liste** | Ce statut existe dans le système mais aucune action de l'interface ne permet actuellement de l'atteindre — seule la suppression définitive retire un souhait de la liste. |
