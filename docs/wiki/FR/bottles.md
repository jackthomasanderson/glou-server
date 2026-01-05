# Tableau des bouteilles (stock mémoire)

## TL;DR
CRUD multi-catégorie avec UI optimiste, corbeille 7 jours et restauration.
Les données sont stockées uniquement en mémoire côté serveur Next : elles disparaissent au redémarrage et ne sont pas liées aux caves ni aux utilisateurs.

## Prérequis
- Frontend Next en cours d'exécution; aucune dépendance API/DB pour les bouteilles.
- Comprendre que le stockage est partagé par instance serveur et non persistant.

> [!CAUTION]
> Toute donnée est perdue au redémarrage du serveur ou du process Next. Ce module sert de démonstrateur et n'assure ni persistance ni séparation par utilisateur.

## Action
1. Accédez au dashboard principal `/dashboard`.
2. Saisissez le tronc commun : nom d'affichage, catégorie, emplacement/collection éventuels, tags, valeur estimée, niveau, état d'alerte, statut entamé.
3. Complétez les essentiels de catégorie (vin/bulles/spiritueux/cigare) puis, si besoin, affichez les compléments optionnels.
4. Enregistrez : l'entrée apparaît immédiatement; les validations Zod empêchent les champs manquants ou incohérents.
5. Modifiez via le bouton Modifier pour recharger le formulaire, puis sauvegardez.
6. Supprimez : l'élément passe en corbeille avec expiration automatique après 7 jours. Vous pouvez restaurer depuis la carte ou via l'action Annuler du toast.

## Pourquoi ça ne marche pas ?
- Disparition des données après un restart : c'est attendu, le store est en mémoire. Aucune persistance n'existe côté API pour l'instant.
- Champs refusés : vérifiez les obligations par catégorie (ex: `producer`/`name`/`vintageOrNone` pour vin) et les bornes numériques (ABV, quantité).
- Corbeille qui ne se vide pas : l'expiration est recalculée lors du listing; si rien n'est appelé, les éléments restent visibles jusqu'au prochain refresh.
- Pas de rattachement aux caves/utilisateurs : le store est global à l'instance Next, il n'y a pas de filtre par compte ni de relation cave.
