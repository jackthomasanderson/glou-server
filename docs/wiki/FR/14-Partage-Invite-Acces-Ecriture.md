# Partager des caves en lecture/écriture avec des invités

## TL;DR
Envoyez un lien à un ami pour qu'il consulte des caves sélectionnées, et éventuellement ouvre ou boive une bouteille, mette à jour un niveau et note une dégustation sur certaines caves, sans compte.

## Prérequis
* Au moins une **Cave** contenant des bouteilles.
* Être connecté à votre compte.

> [!TIP]
> Il s'agit d'un partage invité basé sur un lien, pas d'un compte utilisateur. Il n'y a ni inscription, ni mot de passe, ni invitation admin : toute personne disposant du lien et d'un jeton actif accède exactement à ce que le lien autorise.

## Action

### Créer un partage avec accès en écriture sur certaines caves
1. Allez dans **Profil** et ouvrez la section **Partages Invités**.
2. Cliquez sur **Nouveau partage**, donnez-lui un libellé et (optionnellement) le nom de l'invité.
3. Sélectionnez le périmètre : cochez chaque **cave** à inclure dans le partage.
4. Pour chaque cave cochée, activez l'interrupteur **Autoriser à ouvrir, boire ou fumer** si vous voulez que cet invité puisse y ouvrir ou boire une bouteille (ou fumer un cigare) et y noter des dégustations. Laissez-le désactivé pour les caves que vous voulez seulement lui laisser consulter.
5. Les prix et les notes sont masqués par défaut : les interrupteurs **Masquer les prix et valeurs** et **Masquer les notes personnelles** sont déjà activés. Désactivez un interrupteur pour montrer ces informations à l'invité.
6. Choisissez une expiration : 1 jour, 7 jours, 30 jours, personnalisée, ou illimitée. Avec une date personnalisée, le lien fonctionne jusqu'à la fin de ce jour-là, aujourd'hui compris.
7. Cliquez sur **Créer** et copiez le lien généré pour l'envoyer à votre invité.

> [!CAUTION]
> Une cave ne peut pas recevoir l'accès en écriture sans être également incluse dans le périmètre de lecture : la décocher la retire des deux. Il n'est pas possible de modifier un partage après sa création : révoquez-le et créez-en un nouveau si vous devez changer le périmètre ou les permissions.

### Ce que votre invité peut faire
1. En ouvrant le lien, il arrive sur une page publique (`/guest/<token>`) sans connexion requise.
2. Une bannière indique si le partage est **Lecture seule** ou accorde un **accès partiel en écriture**.
3. Les vins apparaissent par carte, avec leur stock (« 5 pleines · 1 entamée »). Sur les caves en écriture, l'invité peut, **une bouteille à la fois** :
   * **J'en ouvre une**, **J'en bois une** ou, pour un cigare, **J'en fume un** : une seule bouteille quitte sa ligne. S'il y a plusieurs lignes, il choisit **Quelles bouteilles ?**. Si une bouteille est déjà entamée, **J'en bois une** demande « C'est elle que vous avez finie ? » (ou la finit directement s'il ne reste qu'elle). L'invité ne voit pas le plan de cave et n'a pas à dire de quelle case vient la bouteille : Glou prend une bouteille non rangée d'abord, sinon celle de la case rangée le plus récemment, et l'historique du vin dit quelle case a été libérée ;
   * **Annuler** : après chacun de ces gestes, le message « … · Annuler » reste affiché 8 secondes et remet la bouteille avec les autres, dans sa case si elle est encore libre. Passé ce délai, ou si la bouteille a changé entre-temps, « Il est trop tard pour annuler » : seul un membre peut corriger ;
   * régler le **niveau** d'une bouteille entamée ;
   * **Noter une dégustation**, y compris sur la bouteille qu'il vient de boire, même si c'était la dernière : le message qui suit **J'en bois une** propose « Noter une dégustation », et la page continue de le proposer une fois le message disparu. La date du jour est pré-remplie. La dégustation est rattachée à cette bouteille et signée « Nom (invité) » (ou « Invité » si le partage ne nomme personne), dans le journal comme sur la carte du vin.
4. Un invité ne peut **jamais** : changer un nombre de bouteilles, déplacer, changer un prix, ajouter ou supprimer, modifier la description ou les notes d'un vin (les notes appartiennent au vin), **refermer** une bouteille ouverte ni remettre en cave une bouteille finie. Seul un membre le fait. (C'est un recul par rapport aux versions précédentes, où un invité pouvait remettre une bouteille entamée en niveau « Pleine ».)
5. Sur les caves en lecture seule, les vins sont visibles mais non modifiables.

### Révoquer un partage
1. Allez dans **Profil → Partages Invités**.
2. Repérez le partage dans la liste (actif, expiré, ou déjà révoqué) et cliquez sur **Révoquer**.
3. Le lien cesse de fonctionner immédiatement : l'invité voit un message de lien expiré à sa prochaine requête.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Mon invité me dit que le lien affiche "expiré" ou "invalide"** | Le partage a atteint sa date d'expiration, ou vous l'avez révoqué. Créez un nouveau partage et envoyez le lien à jour. |
| **L'invité voit une cave mais ne peut rien y modifier** | Cette cave a été partagée en lecture seule. Révoquez le partage et recréez-le en activant **Autoriser à ouvrir, boire ou fumer** pour cette cave. |
| **Je veux laisser un invité changer le prix ou déplacer une bouteille vers une autre cave** | Pas possible pour les partages invités : l'accès en écriture est volontairement limité à ouvrir ou boire une bouteille, à son niveau et aux dégustations. Créez-lui plutôt un compte complet s'il a besoin de plus (voir [01-Authentification.md](./01-Authentification.md)). |
| **Mon invité a ouvert la mauvaise bouteille et n'arrive plus à la remettre** | Il a 8 secondes pour **Annuler**. Ensuite, un invité ne peut plus refermer une bouteille : remettez-la vous-même avec **Annuler l'ouverture** (voir [04-Gestion-Des-Caves.md](./04-Gestion-Des-Caves.md)). |
| **Chaque action de mon invité sur un item partagé est enregistrée à mon nom** | Non : les modifications invitées sont enregistrées dans l'historique d'audit sous le libellé/nom de l'invité du partage, pas sous votre compte. |
