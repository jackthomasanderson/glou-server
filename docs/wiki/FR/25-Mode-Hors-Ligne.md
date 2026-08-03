# Consulter et Modifier sa Cave sans Connexion

## TL;DR
L'application reste utilisable sans réseau pour consulter l'inventaire et modifier un item déjà chargé (dont marquer une bouteille entamée/consommée) — les changements se synchronisent automatiquement au retour de la connexion, avec résolution manuelle en cas de conflit.

## Prérequis
* Avoir déjà consulté l'application en ligne au moins une fois sur cet appareil, pour que l'inventaire soit mis en cache localement.
* L'application doit être servie en **HTTPS** (ou `localhost` en développement) pour que le Service Worker s'active.

## Action

1. Naviguez normalement dans l'inventaire pendant que vous êtes en ligne — chaque item consulté est mis en cache localement (IndexedDB).
2. En cas de perte de réseau, l'indicateur de connectivité en haut de l'interface passe en mode « hors-ligne » — vous pouvez continuer à parcourir l'inventaire déjà chargé.
3. Modifiez un champ sur un item existant (édition, marquage « entamé »/« consommé » via le flux de dégustation, etc.) : le changement s'applique immédiatement à l'écran et se marque d'un badge « Modifié hors-ligne — en attente de synchronisation ».
4. Dès que la connexion revient, la file de modifications se synchronise automatiquement, dans l'ordre où elles ont été faites.
5. En cas de conflit (le même item a été modifié entre-temps depuis un autre appareil), une modale **Conflit de synchronisation** s'ouvre : elle compare champ par champ votre version et la version serveur, et vous laisse choisir **Garder ma version** ou **Garder la version serveur**.

> [!CAUTION]
> La **création** d'une nouvelle bouteille et la **suppression/restauration** d'un item ne sont **pas** prises en charge hors-ligne : ces actions échouent immédiatement sans réseau et doivent être refaites une fois la connexion rétablie. Seule l'édition d'un item déjà présent dans l'inventaire passe par la file de synchronisation.

## Portée

Cette fonctionnalité couvre volontairement un périmètre borné : lecture complète de l'inventaire hors-ligne, plus l'édition de champs sur un item déjà chargé — ce qui inclut le flux de mise à jour de stock après dégustation (« Entamée » / « Consommée »). Elle ne couvre ni la création, ni la suppression, ni les actions groupées, ni le reste de l'application (souhaits, plan de cave, imports).

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Le mode hors-ligne ne fonctionne pas du tout** | Vérifiez que l'application est servie en HTTPS (ou `localhost` en dev) — le Service Worker ne s'active pas en simple HTTP. Rechargez une fois en ligne pour (ré)installer le Service Worker. |
| **J'ai essayé d'ajouter une bouteille hors-ligne, rien ne s'est passé** | Attendu : seule l'édition d'un item existant est mise en file hors-ligne, pas la création. Reconnectez-vous pour ajouter la bouteille. |
| **La modale de conflit ne montre qu'un seul conflit à la fois** | Comportement voulu : les conflits se résolvent un par un ; le compteur « autres conflits en attente » indique ceux qui restent. |
| **Une modification faite dans un autre onglet du même navigateur n'apparaît pas ici** | Limite connue : la file de synchronisation n'est pas partagée entre onglets du même navigateur — rafraîchissez l'onglet concerné après la synchronisation. |
| **L'item affiché après résolution d'un conflit semble incorrect** | Si vous avez choisi « Garder la version serveur », le cache local est écrasé par la version serveur — rafraîchissez si l'affichage ne se met pas à jour immédiatement. |
