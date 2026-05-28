# Enregistrer et Consulter des Notes de Dégustation

## TL;DR
Naviguez vers `/tastings`, créez une note liée à un actif de votre cave, obtenez immédiatement les recommandations de service, puis retrouvez toutes vos notes en ordre chronologique inversé.

## Prérequis
- Être connecté à Glou.
- Avoir au moins un actif dans votre inventaire pour lier une note (la sélection d'un actif est obligatoire à la création).

## Action

### 1. Accéder au Journal de Dégustation

Cliquez sur **Tastings** dans la navigation principale, ou accédez directement à `/tastings`.

La page liste toutes vos notes de dégustation, triées de la plus récente à la plus ancienne, à raison de **20 notes par page**.

### 2. Créer une note de dégustation

1. Cliquez sur le bouton **+** (FAB en bas à droite) ou sur **Nouvelle dégustation** si la liste est vide.
2. Dans le champ **Actif**, tapez le nom ou le producteur pour filtrer votre inventaire via l'autocomplétion. Sélectionnez l'actif concerné.
3. Dès la sélection, les **Recommandations de Service** apparaissent automatiquement (voir section 3).
4. Renseignez les champs souhaités :

   | Champ | Type | Contrainte |
   | :--- | :--- | :--- |
   | Date de dégustation | Date | Par défaut : aujourd'hui |
   | Note (étoiles) | 1 à 5 | Optionnel |
   | Contexte | Liste | `solo`, `amis`, `restaurant`, `dégustation`, `cadeau` |
   | Notes libres | Texte | Max 5 000 caractères |
   | Accord culinaire | Texte | Max 500 caractères |

5. Cliquez sur **Enregistrer**.

> [!TIP]
> La note se crée sans avoir renseigné les champs optionnels. Seul le champ **Actif** est obligatoire.

### 3. Lire les recommandations de service

Dès qu'un actif est sélectionné dans le formulaire, un bandeau **Recommandations de service** s'affiche avec :

- **Température de service** — plage en °C selon la catégorie et la couleur/type de l'actif.
- **Aération** — durée en minutes recommandée (absente si non applicable, ex. vins blancs, spiritueux).
- **Accords culinaires** — liste de suggestions affichée sous forme de puces.

Le tableau de correspondance appliqué par le système :

| Catégorie / Sous-type | Température | Aération |
| :--- | :--- | :--- |
| Vin rouge | 16–18 °C | 30–60 min |
| Vin blanc | 10–12 °C | 0–15 min |
| Vin rosé | 10–12 °C | — |
| Vin orange | 12–14 °C | 15–30 min |
| Pétillant (tous types) | 6–9 °C | — |
| Whisky / Rhum / Cognac | 18–22 °C | — |
| Gin | 4–8 °C | — |
| Vodka | 2–6 °C | — |
| Autre spiritueux | 18–22 °C | — |
| Cigare | 20–22 °C | — |

Les recommandations sont calculées côté frontend à partir de la catégorie et du sous-type (couleur, `spiritType`, `sparklingType`) de l'actif. Elles ne sont pas stockées en base.

### 4. Modifier une note existante

Sur la carte d'une note, cliquez sur l'icône **crayon**. Le formulaire pré-remplit tous les champs. Modifiez puis **Enregistrer**.

### 5. Supprimer une note

Sur la carte, cliquez sur l'icône **corbeille**. Une boîte de dialogue de confirmation s'affiche.

> [!CAUTION]
> La suppression d'une note de dégustation est définitive. Aucune corbeille ni restauration n'est disponible.

### 6. Naviguer entre les pages

Si vous avez plus de 20 notes, des boutons **<** et **>** apparaissent en bas de la liste pour passer d'une page à l'autre.

> [!TIP]
> L'API accepte le paramètre `itemId` (`GET /api/tastings?itemId=<uuid>`) pour filtrer les notes d'un actif précis — utile si vous intégrez l'API directement.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Résolution |
| :--- | :--- |
| **L'actif n'apparaît pas dans l'autocomplétion** | Seuls les actifs non archivés (`deletedAt = null`) sont listés. Vérifiez que l'actif n'a pas été supprimé ou archivé. |
| **Aucune recommandation de service ne s'affiche** | Les recommandations requièrent une catégorie reconnue (`wine`, `sparkling`, `spirit`, `cigar`). Si l'actif a une catégorie non couverte, le bandeau reste masqué. |
| **Erreur "La sauvegarde a échoué"** | Vérifiez que les champs texte ne dépassent pas les limites (notes : 5 000 car., accord : 500 car.). Si l'actif a été supprimé entre la sélection et la soumission, l'API retourne `ITEM_NOT_FOUND` (404). |
| **Les notes n'apparaissent plus après navigation entre pages** | React Query invalide le cache après chaque mutation. Si la liste reste vide après un rechargement, vérifiez votre connexion réseau. |
| **`VALIDATION_ERROR` en réponse API** | Le champ `rating` doit être un entier entre 1 et 5. Le champ `tastedAt` doit être une date au format `YYYY-MM-DD`. |
