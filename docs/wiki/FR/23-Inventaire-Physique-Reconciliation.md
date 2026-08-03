# Faire l'Inventaire Physique de sa Cave sans Erreur

## TL;DR
Depuis **Inventaire physique**, démarrez une session sur une cave ou un périmètre libre, cochez chaque bouteille trouvée, puis clôturez pour appliquer en un clic les corrections (manquants, inattendus).

## Prérequis
* Au moins une cave configurée pour bénéficier de la liste théorique automatique. Un « périmètre libre » reste possible sans cave, mais sans liste théorique.

## Action

1. Ouvrez **Inventaire physique** dans la barre latérale.
2. Choisissez le mode de périmètre : **Cave existante** (liste théorique calculée automatiquement) ou **Périmètre libre** (libellé libre, ex. « Meuble A, Bac 3 » — aucune liste théorique, tout actif confirmé sera enregistré comme trouvé).
3. Cliquez **Démarrer la session**. L'onglet **Comptage** s'ouvre.
4. Pour chaque actif de la liste, confirmez sa présence d'un tap (**Confirmer**) ou retrouvez-le via la recherche (nom/producteur). Les actifs non confirmés restent « En attente ».
5. Mettez la session en pause à tout moment (**Mettre en pause**) — elle reprend exactement là où vous l'aviez laissée, y compris après reconnexion ou changement d'appareil.
6. Consultez l'onglet **Bilan** pour voir les trois catégories : **Confirmés**, **Manquants**, **Inattendus** (trouvés sur place mais enregistrés ailleurs ou absents de l'inventaire).
7. Pour chaque écart, choisissez une action corrective : **Déclarer consommé**, **Déplacer vers ce périmètre** (indisponible pour un périmètre libre sans cave), ou ajout au stock.
8. Cliquez **Clôturer et appliquer (N)** pour valider toutes les corrections sélectionnées en une seule fois.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **« Une session d'inventaire est déjà en cours »** | Une seule session active est autorisée par instance. Reprenez la session existante ou clôturez-la avant d'en démarrer une nouvelle. |
| **« Déplacer vers ce périmètre » est grisé** | Cette action nécessite un périmètre lié à une vraie cave — un périmètre libre n'a pas de cave cible pour le déplacement. |
| **Aucune liste théorique ne s'affiche** | Normal pour un périmètre libre : sans cave associée, le système ne peut pas savoir quels actifs sont censés s'y trouver. Tout ce que vous confirmez est traité comme trouvé. |
| **Un autre membre voit/modifie ma session en cours** | Attendu : l'inventaire est partagé au niveau de l'instance, donc toute session est visible et actionnable par tous les membres, pas seulement par son créateur. |
