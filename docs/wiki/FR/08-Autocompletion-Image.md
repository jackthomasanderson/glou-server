# Autocomplétion et Recherche d'Image lors de l'Ajout

## TL;DR
Lors de l'ajout d'une bouteille, les champs **Nom** et **Producteur** proposent des suggestions via Google. Si un millésime est détecté dans la suggestion, il est extrait automatiquement. Une recherche d'image permet d'associer une photo depuis Wikimedia Commons.

## Prérequis
- Être connecté à son compte.
- Connexion internet active (les suggestions et images viennent de services externes).

## Action

### 1. Autocomplétion du nom de produit

1. Dans le formulaire d'ajout, à l'étape 1, saisissez au moins **2 caractères** dans le champ **Nom**.
2. Un menu déroulant affiche jusqu'à 6 suggestions contextualisées (préfixées par la catégorie choisie : vin, champagne, whisky…).
3. Cliquez sur une suggestion pour remplir le champ.
4. Si la suggestion contient un millésime (ex : `Pétrus 2015`), le champ **Millésime** est rempli automatiquement et le nom ne contient plus l'année.

> [!TIP]
> La langue de l'interface (FR/EN) détermine la langue des suggestions Google. Passez en anglais dans vos préférences pour obtenir des suggestions en anglais.

### 2. Autocomplétion du producteur

1. Saisissez au moins **2 caractères** dans le champ **Producteur**.
2. Les suggestions sont préfixées par le type de producteur selon la catégorie (château, maison, distillerie…).
3. Les suggestions contenant une année ou un terme commercial (prix, achat, boutique…) sont automatiquement filtrées.

### 3. Recherche d'image (Wikimedia Commons)

1. Dans le formulaire d'ajout ou de modification, cliquez sur l'icône **Rechercher une image** à côté du champ image.
2. Une boîte de dialogue s'ouvre avec un champ de recherche pré-rempli avec le nom de la bouteille.
3. Les résultats affichent jusqu'à 8 miniatures issues de Wikimedia Commons.
4. Cliquez sur une image pour la sélectionner. Elle est associée à la fiche bouteille.

> [!CAUTION]
> Les images proviennent de Wikimedia Commons (domaine public / licence libre). Vérifiez la licence de l'image affichée si vous comptez réutiliser ce contenu en dehors de Glou.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Résolution |
| :--- | :--- |
| **Aucune suggestion n'apparaît** | Vérifiez la connexion internet. Les suggestions passent par `suggestqueries.google.com`. Si le serveur n'a pas accès internet sortant, l'autocomplétion est silencieusement désactivée. |
| **Le millésime n'est pas extrait automatiquement** | L'extraction détecte les années au format `XXXX` (1900–2099). Si l'année est écrite autrement (ex: `'15`), elle ne sera pas reconnue. |
| **Aucune image trouvée** | Le nom saisi ne correspond à aucun fichier sur Wikimedia Commons. Essayez un terme plus générique (ex: `Bordeaux rouge` au lieu du nom exact du château). |
| **L'icône recherche image est absente** | Elle n'est disponible qu'à l'étape 2 du formulaire. Complétez l'étape 1 et passez à la suivante. |
| **Indicateur de connexion rouge dans la navbar** | Le serveur ne peut pas joindre les services externes. Les suggestions et la recherche d'images sont indisponibles. L'ajout manuel reste possible. |
