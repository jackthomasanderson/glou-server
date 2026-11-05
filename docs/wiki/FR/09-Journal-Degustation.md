# Enregistrer et consulter des notes de dégustation

## TL;DR
Naviguez vers `/cellar-journal`, créez une note liée à un vin (et, si vous le souhaitez, à une bouteille de votre cave), consultez les recommandations de service, puis parcourez vos notes de la plus récente à la plus ancienne.

## Prérequis
- Être connecté à Glou.
- Un vin à déguster : un vin de votre liste (même s'il ne vous reste aucune bouteille), ou un vin goûté ailleurs que vous saisissez par son nom.

## Action

### 1. Accéder au journal de dégustation

Cliquez sur **Dégustations** dans la navigation principale (sur téléphone, dans le menu **Plus**), ou accédez directement à `/cellar-journal`.

La page liste toutes vos notes de dégustation, triées de la plus récente à la plus ancienne, à raison de **20 notes par page**.

### 2. Créer une note de dégustation

1. Cliquez sur le bouton **+** (FAB en bas à droite) ou sur **Nouvelle dégustation** si la liste est vide.
2. Dans le champ **Vin dégusté**, tapez le nom ou le producteur pour filtrer vos vins via l'autocomplétion, puis sélectionnez le vin. Un vin dont il ne reste aucune bouteille est proposé aussi.
   * **Sur une bouteille de la cave ?** répondez **Oui** (puis **Quelle bouteille ?** s'il y a plusieurs lignes ; la bouteille entamée est présélectionnée, sinon la seule ligne) ou **Non, goûté ailleurs** (chez un ami, au restaurant : la dégustation ne touche à aucun stock).
   * **Ce vin n'est pas dans la liste** : saisissez sa catégorie, son producteur, son nom, son millésime. Si Glou connaît déjà ce vin, la dégustation va sur lui ; sinon, Glou le crée **sans bouteille** (il apparaît sous le filtre **Plus en cave**). Il n'existe pas d'ajout « 0 bouteille » : c'est le seul chemin.
3. Dès la sélection, les **Recommandations de service** apparaissent (voir section 3).
4. Renseignez les champs souhaités :

   | Champ | Type | Contrainte |
   | :--- | :--- | :--- |
   | Date de dégustation | Date | Par défaut : aujourd'hui |
   | Note (étoiles) | 1 à 5 | Optionnel |
   | Contexte | Liste | `solo`, `amis`, `restaurant`, `dégustation`, `cadeau` |
   | Notes libres | Texte | Max 5 000 caractères |
   | Accord culinaire | Texte | Max 500 caractères |

5. Cliquez sur **Enregistrer**.
   Sur une bouteille de la cave, Glou demande ensuite **Mettre à jour le stock ?** (**Bouteille entamée**, **Bouteille bue (vide)** ou **Ne pas modifier le stock**). Si la ligne compte plusieurs bouteilles dont certaines sont rangées sur le plan de cave, il demande aussi **De quelle case ?**, avec **Non rangée** présélectionnée s'il en reste (voir [04-Gestion-Des-Caves.md](./04-Gestion-Des-Caves.md)). La dégustation est enregistrée dans tous les cas.

> [!TIP]
> Seul le champ **Vin dégusté** est obligatoire.

### 3. Lire les recommandations de service

Dès qu'un vin est sélectionné dans le formulaire, un bandeau **Recommandations de service** s'affiche avec :

- **Température de service** : plage en °C selon la catégorie et la couleur/type du vin.
- **Aération** : durée en minutes recommandée (absente si non applicable, ex. vins blancs, spiritueux).
- **Accords culinaires** : liste de suggestions affichée sous forme de puces.

Valeurs appliquées par le système :

| Catégorie / Sous-type | Température | Aération |
| :--- | :--- | :--- |
| Vin rouge | 16-18 °C | 30-60 min |
| Vin blanc | 10-12 °C | 0-15 min |
| Vin rosé | 10-12 °C | - |
| Vin orange | 12-14 °C | 15-30 min |
| Pétillant (tous types) | 6-9 °C | - |
| Whisky / Rhum / Cognac | 18-22 °C | - |
| Gin | 4-8 °C | - |
| Vodka | 2-6 °C | - |
| Autre spiritueux | 18-22 °C | - |
| Cigare | 20-22 °C | - |

Les recommandations sont calculées côté frontend à partir de la catégorie et du sous-type (couleur, `spiritType`, `sparklingType`) du vin. Elles ne sont pas stockées en base.

### Où retrouver les dégustations d'un vin
Toutes les dégustations d'un vin s'affichent sur sa carte (tiroir), quelle que soit la bouteille sur laquelle elles ont été notées, y compris celles « Goûté ailleurs ». Si vous ouvrez puis refermez une bouteille sur laquelle une dégustation était notée, Glou demande si vous la gardez (elle reste alors sur le vin). Une dégustation notée par un invité porte la mention « Nom (invité) ».

### 4. Modifier une note existante

Sur la carte d'une note, cliquez sur l'icône **crayon**. Le formulaire pré-remplit tous les champs. Modifiez puis **Enregistrer**.

### 5. Supprimer une note

Sur la carte, cliquez sur l'icône **corbeille**. Une boîte de dialogue de confirmation s'affiche.

> [!CAUTION]
> La suppression d'une note de dégustation est définitive. Aucune corbeille ni restauration n'est disponible.

### 6. Naviguer entre les pages

Si vous avez plus de 20 notes, des boutons **<** et **>** apparaissent en bas de la liste pour passer d'une page à l'autre.

> [!TIP]
> L'API accepte le paramètre `itemId` (`GET /api/tastings?itemId=<uuid>`) pour filtrer les notes d'une bouteille précise ; `productId` filtre celles d'un vin.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Résolution |
| :--- | :--- |
| **Le vin n'apparaît pas dans l'autocomplétion** | Un vin mis à la corbeille n'est pas listé : restaurez-le, ou saisissez-le par son nom (**Ce vin n'est pas dans la liste**), ce qui crée un nouveau vin proposé ensuite dans « À regrouper ? » s'il ressemble à l'ancien. |
| **Aucune recommandation de service ne s'affiche** | Les recommandations requièrent une catégorie reconnue (`wine`, `sparkling`, `spirit`, `cigar`). Si le vin a une catégorie non couverte, le bandeau reste masqué. |
| **Erreur "La sauvegarde a échoué"** | Vérifiez que les champs texte ne dépassent pas les limites (notes : 5 000 car., accord : 500 car.). Si la bouteille a été supprimée entre la sélection et la soumission, l'API retourne `ITEM_NOT_FOUND` (404). |
| **Les notes n'apparaissent plus après navigation entre pages** | React Query invalide le cache après chaque mutation. Si la liste reste vide après un rechargement, vérifiez votre connexion réseau. |
| **`VALIDATION_ERROR` en réponse API** | Le champ `rating` doit être un entier entre 1 et 5. Le champ `tastedAt` doit être une date au format `YYYY-MM-DD`. |
