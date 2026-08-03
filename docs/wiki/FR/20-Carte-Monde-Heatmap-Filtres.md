# Explorer sa Collection sur la Carte du Monde

## TL;DR
Le tableau de bord Analytics comprend une carte du monde interactive de votre collection par région — filtrez-la par catégorie, basculez en mode heatmap par type, affinez avec des filtres prix/millésime/note/état, et cliquez sur n'importe quel actif de la liste pour ouvrir sa fiche détaillée.

## Prérequis
* Des actifs avec un pays/région renseigné — les actifs sans cette information n'apparaissent pas sur la carte.

## Action

### Ouvrir la carte
1. Allez dans **Analytics** dans la barre latérale.
2. Descendez jusqu'à la section **Carte du monde** du tableau de bord. Elle fait partie de la page Analytics, ce n'est pas une route séparée.

### Filtrer par catégorie
1. Dans le panneau de filtres, utilisez les puces **Type d'actif** pour sélectionner une ou plusieurs catégories (**Vin**, **Effervescent**, **Spiritueux**, **Cigare**), ou laissez **Toutes catégories** sélectionné.
2. Les marqueurs de la carte et la liste d'actifs en dessous se mettent à jour immédiatement — le filtrage s'exécute entièrement dans votre navigateur sur l'inventaire déjà chargé, donc c'est instantané même avant de toucher à la carte.

### Basculer en mode heatmap
1. Utilisez le sélecteur de mode au-dessus de la carte pour passer de **Marqueurs** à **Heatmap par type**.
2. Choisissez ce que représente la couleur via le sélecteur de type :
   - **Catégorie dominante** — chaque région est colorée selon la catégorie la plus représentée à cet endroit.
   - Une catégorie spécifique (**Vin**, **Effervescent**, **Spiritueux**, **Cigare**) — l'opacité du marqueur de chaque région varie selon le nombre d'actifs de cette catégorie qu'elle contient, relativement à votre région la mieux fournie.
3. Une légende de couleurs sous la carte indique quelle couleur correspond à quelle catégorie.

> [!TIP]
> Les régions sans aucun actif du type sélectionné apparaissent visuellement neutres (opacité très faible) plutôt que de disparaître — vous pouvez ainsi toujours voir où se trouvent les manques de votre collection.

### Utiliser le panneau de filtres avancés
Le panneau de filtres (rétractable, se masque pour laisser plus de place à la carte sur petit écran) comprend :
- **Prix** — champs numériques min/max.
- **Millésime / Année** — champs numériques min/max.
- **Note** — une liste cliquable (`Toutes notes`, `1+★` … `5★`), pas un curseur.

  > [!CAUTION]
  > La note provient de vos notes de dégustation, pas de l'inventaire lui-même, et n'est calculée que sur vos **50 dégustations les plus récentes**. Sur une grande collection, c'est une approximation, pas l'historique complet des dégustations — le panneau affiche une infobulle d'avertissement à ce sujet.

- **État** — `Tous`, `En cave (non entamé)`, ou `Entamé`.

Tous les filtres se combinent avec le filtre catégorie et s'appliquent à la fois à la carte et à la liste en dessous.

### Parcourir et ouvrir des actifs depuis la liste
1. Sous la carte, la liste d'actifs filtrée affiche pour chaque actif : miniature, nom, badge catégorie, millésime et localisation.
2. Cliquez sur une ligne (ou appuyez sur Entrée/Espace lorsqu'elle est sélectionnée au clavier) pour ouvrir la **fiche détaillée** de cet actif dans une fenêtre modale — vous restez sur la page Analytics, il n'y a pas de navigation vers une autre page.
3. Cliquez sur un marqueur de la carte (ou une région) pour restreindre la liste à cette région uniquement ; une puce apparaît indiquant la région sélectionnée avec un bouton pour la retirer et revenir à la liste filtrée complète.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Certains de mes actifs n'apparaissent pas du tout sur la carte** | Il leur manque une valeur pays/région. Ajoutez-en une depuis la fiche détaillée de l'actif — la carte n'affiche que les actifs avec ce champ renseigné. |
| **Les couleurs de la heatmap ne correspondent pas à ce que j'attends** | Vérifiez le sélecteur de type au-dessus de la légende — "Catégorie dominante" colore selon la catégorie la plus fréquente par région, ce qui peut différer d'une heatmap sur une seule catégorie. |
| **Le filtre note semble ignorer certaines dégustations** | Il se base volontairement sur vos 50 notes de dégustation les plus récentes uniquement — voir l'infobulle à côté du filtre Note. C'est une approximation pour les grandes collections, pas une requête sur l'historique complet. |
| **Cliquer sur un actif ne fait rien / rien ne s'ouvre** | Assurez-vous de cliquer directement sur la ligne (ou l'élément de liste), pas sur le marqueur de la carte — les marqueurs restreignent la liste à une région, ils n'ouvrent pas directement un actif. |
| **Le panneau de filtres a disparu sur mon téléphone** | Il est repliable par conception sur petit écran pour laisser de la place à la carte — cherchez le bouton pour le redéployer. |
