# Autocomplétion, Recherche d'Image & Visualisation Graphique

## TL;DR
Lors de l'ajout d'un item, les champs **Nom** et **Producteur** proposent des suggestions via Google. Dès que ces deux champs sont remplis, une image est recherchée sur internet et sauvegardée automatiquement en local — sans aucune action de votre part. L'image apparaît en haut de la carte dans l'inventaire et en tête de la fiche détail, à la manière de Vivino.

## Prérequis
- Être connecté à son compte.
- Connexion internet active pour la recherche initiale (les images déjà stockées restent visibles hors ligne).

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

### 3. Image automatique

Dès que **Nom** et **Producteur** sont tous deux remplis, Glou :
1. Lance silencieusement une recherche d'image sur internet (DuckDuckGo Images).
2. Télécharge et stocke le premier résultat pertinent en local.
3. Affiche une miniature de l'image dans la section **Photo** du formulaire.

Vous n'avez rien à faire. Si l'image convient, ignorez simplement la section. Elle sera enregistrée avec la fiche.

### 4. Remplacer ou affiner l'image

Dans la section **Compléments** du formulaire, la section **Photo** propose trois options :

| Action | Comment |
|--------|---------|
| **Rechercher** (icône loupe) | Ouvre un sélecteur visuel (grille de miniatures). Affinez la requête et choisissez une autre image. |
| **Coller une URL** (icône lien) | Collez l'URL d'une image depuis un site marchand, Google Images, etc. L'image est téléchargée et stockée localement. |
| **Uploader un fichier** (icône appareil photo) | Chargez une photo depuis votre appareil (JPG, PNG, WebP — max 5 Mo). |

> [!NOTE]
> Quelle que soit la source, l'image est **toujours stockée localement** sur votre serveur. Aucune URL externe n'est conservée dans la base de données.

### 5. Visualisation dans l'inventaire

- **Avec image** : la photo de la bouteille apparaît en haut de la carte (hauteur 150 px, cadrage automatique).
- **Sans image** : un aplat coloré selon la catégorie (rouge pour le vin, bleu pour les bulles…) s'affiche à la place.
- **Fiche détail** : l'image occupe une position proéminente en tête de la fiche.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Résolution |
| :--- | :--- |
| **Aucune suggestion n'apparaît** | Vérifiez la connexion internet. Les suggestions passent par `suggestqueries.google.com`. Si le serveur n'a pas accès internet sortant, l'autocomplétion est silencieusement désactivée. |
| **Le millésime n'est pas extrait automatiquement** | L'extraction détecte les années au format `XXXX` (1900–2099). Si l'année est écrite autrement (ex : `'15`), elle ne sera pas reconnue. |
| **Aucune image apparaît automatiquement** | La recherche automatique nécessite une connexion internet. En mode hors-ligne, un avertissement s'affiche une fois par session. L'ajout manuel reste disponible. |
| **L'image automatique ne correspond pas** | Ouvrez la section Compléments et utilisez le sélecteur visuel pour choisir une autre image ou uploader la vôtre. |
| **Indicateur de connexion rouge dans la navbar** | Le serveur ne peut pas joindre les services externes. Les suggestions et la recherche d'images sont indisponibles. L'ajout manuel reste possible. |
