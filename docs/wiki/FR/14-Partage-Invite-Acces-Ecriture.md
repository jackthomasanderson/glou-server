# Partager des Caves en Lecture/Écriture avec des Invités

## TL;DR
Envoyez un lien à un ami pour qu'il consulte des caves sélectionnées — et éventuellement le laisser enregistrer des dégustations et mettre à jour les niveaux de remplissage sur certaines caves, sans lui créer de compte.

## Prérequis
* Au moins une **Cave** contenant des bouteilles.
* Être connecté à votre compte.

> [!TIP]
> Il s'agit d'un partage invité basé sur un lien, pas d'un compte utilisateur. Il n'y a ni inscription, ni mot de passe, ni invitation admin impliquée — toute personne disposant du lien et d'un jeton actif accède exactement à ce que le lien autorise.

## Action

### Créer un partage avec accès en écriture sur certaines caves
1. Allez dans **Profil** et ouvrez la section **Partages Invités**.
2. Cliquez sur **Nouveau partage**, donnez-lui un libellé et (optionnellement) le nom de l'invité.
3. Sélectionnez le périmètre : cochez chaque **cave** à inclure dans le partage.
4. Pour chaque cave cochée, basculez l'interrupteur **Lecture seule / Lecture-écriture** sur **Lecture-écriture** si vous voulez que cet invité puisse y enregistrer des dégustations. Laissez sur **Lecture seule** les caves que vous voulez seulement lui laisser consulter.
5. Activez si besoin **Masquer les prix** et/ou **Masquer les notes** pour garder ces informations privées vis-à-vis de l'invité.
6. Choisissez une expiration : 1 jour, 7 jours, 30 jours, personnalisée, ou illimitée.
7. Cliquez sur **Créer** et copiez le lien généré pour l'envoyer à votre invité.

> [!CAUTION]
> Une cave ne peut pas recevoir l'accès en écriture sans être également incluse dans le périmètre de lecture — la décocher la retire des deux. Il n'est pas possible de modifier un partage après sa création : révoquez-le et créez-en un nouveau si vous devez changer le périmètre ou les permissions.

### Ce que votre invité peut faire
1. En ouvrant le lien, il arrive sur une page publique (`/guest/<token>`) sans connexion requise.
2. Une bannière indique si le partage est **Lecture seule** ou accorde un **accès partiel en écriture**.
3. Sur les caves en écriture, chaque item affiche un bouton **Modifier** permettant à l'invité de mettre à jour uniquement : le statut ouvert, le niveau de remplissage et les notes de dégustation. Il ne peut pas modifier le prix, la quantité, l'emplacement, ni ajouter/supprimer des items.
4. Sur les caves en lecture seule, les items sont visibles mais non modifiables.

### Révoquer un partage
1. Allez dans **Profil → Partages Invités**.
2. Repérez le partage dans la liste (actif, expiré, ou déjà révoqué) et cliquez sur **Révoquer**.
3. Le lien cesse de fonctionner immédiatement — l'invité voit un message de lien expiré à sa prochaine requête.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Mon invité me dit que le lien affiche "expiré" ou "invalide"** | Le partage a atteint sa date d'expiration, ou vous l'avez révoqué. Créez un nouveau partage et envoyez le lien à jour. |
| **L'invité voit une cave mais ne peut rien y modifier** | Cette cave a été partagée en lecture seule. Révoquez le partage et recréez-le en activant l'interrupteur lecture-écriture pour cette cave spécifique. |
| **Je veux laisser un invité changer le prix ou déplacer une bouteille vers une autre cave** | Pas possible pour les partages invités — l'accès en écriture est volontairement limité au statut ouvert, au niveau de remplissage et aux notes. Créez-lui plutôt un compte complet s'il a besoin de plus (voir [01-Authentification.md](./01-Authentification.md)). |
| **Chaque action de mon invité sur un item partagé est enregistrée à mon nom** | Non — les modifications invitées sont enregistrées dans l'historique d'audit sous le libellé/nom de l'invité du partage, pas sous votre compte. |
