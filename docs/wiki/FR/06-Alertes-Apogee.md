# Configurer les Alertes Apogée

## TL;DR
Saisissez une année de début et de fin d'apogée sur une bouteille (vin ou pétillant) : le tableau de bord vous alerte automatiquement quand elle approche ou atteint son optimum.

## Prérequis
- Avoir une bouteille de catégorie **Vin** ou **Pétillant** dans votre cave.
- La fenêtre d'apogée s'applique uniquement à ces deux catégories.

## Action

### 1. Saisir la fenêtre d'apogée

1. Ouvrez la fiche d'une bouteille (**Modifier**) ou créez-en une nouvelle.
2. À l'étape 2 (détails de catégorie), dépliez la section optionnelle via **Afficher les champs optionnels**.
3. Renseignez **Début de fenêtre optimale (année)** — ex : `2027`.
4. Renseignez **Fin de fenêtre optimale (année)** — ex : `2035`.
5. Sauvegardez. Le statut est calculé immédiatement côté serveur.

> [!TIP]
> Un seul des deux champs suffit : si seulement la fin est renseignée, le calcul utilise la même valeur comme début.

### 2. Lire le badge sur la carte bouteille

Chaque carte affiche un badge coloré dans la zone de métadonnées :

| Couleur | Statut | Signification |
| :--- | :--- | :--- |
| Bleu | **Approaching** | L'apogée commence dans le futur |
| Vert | **At peak** | L'année courante est dans la fenêtre |
| Rouge | **Past peak** | La fenêtre est dépassée |
| Gris | — | Alerte suspendue ou pas de fenêtre définie |

### 3. Consulter le centre d'alertes

Le panneau **Alertes Apogée** apparaît automatiquement en haut du tableau de bord dès qu'une bouteille non suspendue a le statut `approaching`, `peak` ou `past`.

- Les bouteilles sont triées par urgence : **past** en tête, puis **peak**, puis **approaching**.
- Le bandeau change de couleur selon le cas le plus urgent (rouge / vert / bleu).

### 4. Suspendre ou réactiver une alerte

Depuis le centre d'alertes, cliquez sur l'icône cloche à droite de la ligne de la bouteille.

- L'alerte disparaît du centre d'alertes.
- Le badge sur la carte passe en gris avec contour (opacity réduite).
- Pour réactiver, cliquez à nouveau sur l'icône.

> [!CAUTION]
> Suspendre une alerte ne modifie pas la fenêtre d'apogée enregistrée. Réactiver l'alerte restaure le statut calculé sans perte de données.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Résolution |
| :--- | :--- |
| **Les champs d'apogée n'apparaissent pas** | Ils ne sont disponibles que pour les catégories **Vin** et **Pétillant**. Vérifiez la catégorie sélectionnée à l'étape 1. |
| **Le badge n'apparaît pas après sauvegarde** | `alertStatus` est calculé côté serveur à la sauvegarde. Rafraîchissez la page si le badge ne s'affiche pas immédiatement. |
| **Le centre d'alertes n'apparaît pas** | Il ne s'affiche que si au moins une bouteille a un statut `approaching`, `peak` ou `past` **et** que son alerte n'est pas suspendue. Vérifiez les deux conditions. |
| **Le statut est incorrect** | Le calcul se base sur l'année courante du serveur. Si le serveur est dans un fuseau horaire différent, l'année de référence peut différer d'une unité en début/fin d'année. |
| **Modifier la fenêtre ne met pas à jour le badge immédiatement** | Après chaque modification de bouteille, le backend recalcule `alertStatus`. Le frontend invalide le cache React Query : un rechargement manuel est nécessaire seulement si la mise à jour est bloquée côté réseau. |
