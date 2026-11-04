# Consulter et modifier sa cave sans connexion

## TL;DR
Sans réseau, l'application permet de consulter l'inventaire, d'ouvrir, boire ou fumer une bouteille d'une ligne, de corriger un nombre à la baisse et de modifier un vin déjà chargé. Les changements se synchronisent automatiquement au retour de la connexion, avec résolution manuelle en cas de conflit.

## Prérequis
* Avoir déjà consulté l'application en ligne au moins une fois sur cet appareil, pour que l'inventaire soit mis en cache localement.
* L'application doit être servie en **HTTPS** (ou `localhost` en développement) pour que le Service Worker s'active.

## Action

1. Naviguez normalement dans l'inventaire pendant que vous êtes en ligne : chaque item consulté est mis en cache localement (IndexedDB).
2. En cas de perte de réseau, l'indicateur de connectivité en haut de l'interface passe en mode « hors-ligne ». Vous pouvez continuer à parcourir l'inventaire déjà chargé.
3. Modifiez un champ sur un item existant (édition, marquage « entamé »/« consommé » via le flux de dégustation, etc.) : le changement s'applique immédiatement à l'écran et se marque d'un badge « Modifié hors-ligne — en attente de synchronisation ».
   **Ouvrir, boire, fumer** : **J'en ouvre une**, **J'en bois une** ou **J'en fume un** fonctionnent comme en ligne et s'affichent aussitôt avec la mention « en attente de connexion ». **Corriger le nombre** (à la baisse, avec son motif) est mis en file de la même façon. Le message **Annuler** reste proposé 8 secondes, et un panneau **Modifications en attente** permet d'annuler une action pas encore envoyée.
4. Dès que la connexion revient, la file de modifications se synchronise automatiquement, dans l'ordre où elles ont été faites. Plusieurs modifications du même item (par exemple entamée à 50 %, puis terminée) sont envoyées l'une après l'autre, chacune séparément, sans conflit avec vous-même. Si le serveur est momentanément indisponible (redémarrage, mise à jour), les modifications restent en attente, toujours affichées à l'écran, et l'envoi est retenté automatiquement quelques secondes plus tard. Une seule fenêtre à la fois envoie la file, même si Glou est ouvert dans plusieurs onglets. Si le serveur refuse encore la même modification après une dizaine d'essais (environ huit minutes), elle passe en « Refusée par le serveur ».
5. En cas de conflit (le même item a été modifié entre-temps depuis un autre appareil), une modale **Conflit de synchronisation** s'ouvre : elle ne montre que les champs dont la valeur diffère entre votre version et la version serveur (pour une action sur une ligne : « Votre action » et « Cette ligne : ×6 quand vous avez agi, ×5 maintenant »), et vous choisissez **Garder ma version** ou **Garder la version serveur**. **Décider plus tard** masque le conflit jusqu'à la fermeture de l'onglet, même si vous changez de page ; il reste signalé par l'indicateur de synchronisation, et le bouton **Résoudre** du panneau **Modifications en attente** rouvre la fenêtre de conflit.

6. Cliquez sur le badge de synchronisation dans l'en-tête pour ouvrir le panneau **Modifications en attente**. Il liste chaque modification en file avec son état (en attente d'envoi, synchronisation, conflit). Une modification refusée par le serveur affiche la raison, avec les boutons **Réessayer** et **Abandonner** : corrigez la cause puis réessayez, ou abandonnez la modification pour la supprimer définitivement.

> [!CAUTION]
> **Ajouter des bouteilles**, **Déplacer**, **Changer le prix**, **Regrouper** (« À vérifier »), les actions groupées, la **création** d'un vin et la **suppression/restauration** ne sont **pas** prises en charge hors-ligne : ces actions sont grisées (« Disponible au retour de la connexion ») ou échouent sans réseau et doivent être faites une fois la connexion rétablie.

## Portée

Le périmètre est volontairement borné : lecture complète de l'inventaire hors-ligne, plus l'ouverture / la consommation d'une bouteille, la correction à la baisse d'un nombre et l'édition de champs sur un vin déjà chargé, y compris le flux de mise à jour de stock après dégustation. Elle ne couvre ni l'ajout, ni le déplacement ni le changement de prix d'une partie d'une ligne, ni la suppression, ni les actions groupées, ni le reste de l'application (souhaits, plan de cave, imports).

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Le mode hors-ligne ne fonctionne pas du tout** | Vérifiez que l'application est servie en HTTPS (ou `localhost` en dev) : le Service Worker ne s'active pas en simple HTTP. Rechargez une fois en ligne pour (ré)installer le Service Worker. |
| **J'ai essayé d'ajouter une bouteille hors-ligne, rien ne s'est passé** | Attendu : seules l'édition, l'ouverture/consommation et la correction d'un nombre sont mises en file hors-ligne, pas l'ajout. Reconnectez-vous pour ajouter la bouteille. |
| **Le conflit dit « La connexion a peut-être coupé… »** | Votre action est peut-être déjà enregistrée (la réponse s'est perdue) : la ligne a bougé exactement comme votre action le ferait. Dans ce cas, choisissez **Garder la version serveur** pour ne pas la compter deux fois. |
| **La modale de conflit ne montre qu'un seul conflit à la fois** | Comportement voulu : les conflits se résolvent un par un ; le compteur « autres conflits en attente » indique ceux qui restent. |
| **Des modifications restent « en attente » alors que la connexion est revenue** | Le serveur ne répond pas encore (redémarrage, mise à jour) ou attend la fin de votre connexion (second facteur) : l'envoi est retenté automatiquement, de plus en plus espacé (jusqu'à une minute). Aucune action n'est nécessaire. Si le serveur refuse encore la modification après une dizaine d'essais, elle passe en « Refusée par le serveur » ; une session expirée ou une connexion à terminer ne compte pas : la modification attend simplement que vous soyez reconnecté. |
| **Une modification reste bloquée sur « Refusée par le serveur »** | Ouvrez **Modifications en attente** depuis le badge de synchronisation, lisez la raison, puis **Réessayez** une fois la cause corrigée ou **Abandonnez** la modification. |
| **Une modification faite dans un autre onglet du même navigateur n'apparaît pas ici** | Limite connue : l'affichage d'un autre onglet n'est pas mis à jour tout seul ; rafraîchissez l'onglet concerné après la synchronisation. |
| **L'item affiché après résolution d'un conflit semble incorrect** | Si vous avez choisi « Garder la version serveur », le cache local est écrasé par la version serveur. Rafraîchissez si l'affichage ne se met pas à jour immédiatement. |
