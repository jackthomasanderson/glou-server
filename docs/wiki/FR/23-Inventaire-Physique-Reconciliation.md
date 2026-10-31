# Faire l'inventaire physique de sa cave

## TL;DR
Depuis **Inventaire physique**, démarrez une session sur une cave ou un périmètre libre, dites combien de bouteilles de chaque ligne vous avez trouvées, puis clôturez pour appliquer en un clic les corrections (manquantes, en plus, inattendues).

## Prérequis
* Au moins une cave configurée pour bénéficier de la liste théorique automatique. Un « périmètre libre » reste possible sans cave, mais sans liste théorique.

## Action

1. Ouvrez **Inventaire physique** dans la barre latérale.
2. Choisissez le mode de périmètre : **Cave existante** (liste théorique calculée automatiquement) ou **Périmètre libre** (libellé libre, ex. « Meuble A, Bac 3 » ; aucune liste théorique, toute bouteille confirmée est enregistrée comme trouvée).
3. Cliquez **Démarrer la session**. L'onglet **Comptage** s'ouvre.
4. Chaque groupe de bouteilles identiques tient sur une ligne avec son nombre (« ×6 ») : répondez à **Combien en avez-vous trouvé ?** (prérempli au nombre attendu) puis **Valider**. Une bouteille seule ou entamée se confirme d'un tap (**Confirmer**). La recherche (nom/producteur) ou le QR code d'un groupe amène à sa question, sans le confirmer en entier. Les lignes non pointées restent « En attente ».
   Une bouteille absente de Glou se saisit par **Introuvable dans la liste ? Enregistrer une trouvaille**, avec le **Nombre trouvé** : une trouvaille de 6 bouteilles formera un groupe ×6.
5. Mettez la session en pause à tout moment (**Mettre en pause**). Elle reprend là où vous l'aviez laissée, y compris après reconnexion ou changement d'appareil.
6. Consultez l'onglet **Bilan**, compté en bouteilles : **Confirmés**, **Manquants** (« 2 manquantes sur 6 »), **En plus** et **Inattendus** (trouvés sur place mais enregistrés ailleurs, ou absents de Glou).
7. Pour chaque écart, choisissez :
   * bouteilles manquantes : **Bues** (elles passent dans « Déjà bues ou parties » et restent dans les dépenses), ou corriger le nombre avec son motif : **Erreur de saisie** (elles n'ont jamais existé) ou **Cassées / offertes / perdues** (elles sortent du stock mais restent dans les dépenses) ;
   * bouteilles en plus : **Ajouter N bouteilles au groupe** ;
   * bouteille enregistrée ailleurs : **Déplacer vers ce périmètre** (indisponible pour un périmètre libre sans cave) ;
   * trouvaille : **Ajouter N bouteilles à la cave**, dans un vin déjà connu du même nom (proposé quand il n'y en a qu'un) ou comme un nouveau vin.
8. Cliquez **Clôturer et appliquer (N)** pour valider toutes les corrections sélectionnées en une seule fois.

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **« Une session d'inventaire est déjà en cours »** | Une seule session active est autorisée par instance. Reprenez la session existante ou clôturez-la avant d'en démarrer une nouvelle. |
| **« Déplacer vers ce périmètre » est grisé** | Cette action nécessite un périmètre lié à une vraie cave. Un périmètre libre n'a pas de cave cible pour le déplacement. |
| **Aucune liste théorique ne s'affiche** | Normal pour un périmètre libre : sans cave associée, le système ne peut pas savoir quelles bouteilles sont censées s'y trouver. Tout ce que vous confirmez est traité comme trouvé. |
| **« N corrections n'ont pas pu être appliquées »** après la clôture | Les bouteilles concernées ont changé entre le bilan et la clôture (bues, corrigées ou mises à la corbeille par un autre membre). Vérifiez-les dans leur fiche. |
| **Un autre membre voit/modifie ma session en cours** | Attendu : l'inventaire est partagé au niveau de l'instance, donc toute session est visible et actionnable par tous les membres, pas seulement par son créateur. |
