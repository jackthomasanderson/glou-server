# Ajouter une ou plusieurs bouteilles

## TL;DR
Ajoutez un vin, un spiritueux ou un cigare à une cave, avec le nombre de bouteilles que vous avez achetées. Un vin que vous avez déjà est reconnu : il ne reste alors qu'à dire combien, où et à quel prix.

## Prérequis
* Avoir créé au moins une **Cave**.
* Être connecté à son compte.

## Action

### Ajouter un nouveau vin
1. Ouvrez **Vins**, **Bulles**, **Spiritueux** ou **Cigares** dans la navigation, puis cliquez sur **+ Ajouter** (sur téléphone, le bouton rond **+**). Le formulaire s'ouvre sur cette catégorie.
2. **Étape 1 (Tronc commun)** : Vérifiez ou changez la catégorie : Vin, Bulles, Spiritueux ou Cigare.
3. Choisissez la cave de destination.
4. Saisissez le nom et le producteur. Les champs proposent une **autocomplétion via Google** dès 2 caractères. Si une suggestion contient un millésime, il est extrait automatiquement dans le champ Millésime. Voir [08-Autocompletion-Image.md](./08-Autocompletion-Image.md).
5. Indiquez le **Nombre de bouteilles** (1 par défaut). Le prix d'achat et la valeur estimée sont ceux d'**une** bouteille : Glou multiplie. Les bouteilles achetées ensemble forment une seule ligne, « 6 · Garage · 20 € ».
6. **Étape 2 (Options spécifiques)** : Les champs s'adaptent selon la catégorie choisie (ex : cépage pour le vin, âge pour l'alcool). Une icône **Rechercher une image** permet d'associer une photo depuis Wikimedia Commons.
7. Cliquez sur **Sauvegarder**. Le vin apparaît sur une seule carte, quel que soit le nombre de bouteilles.

### Cigares
Pour un cigare, choisissez le **Rangement** : **Boîtes fermées** (« 3 boîtes de 25 cigares », avec le prix d'**une boîte**) ou **À l'unité** (« 4 cigares », avec le prix d'**un cigare**). Pour une boîte déjà entamée, cochez **Boîte entamée** et indiquez les **Cigares restants dans la boîte**.

### Vous avez déjà ce vin
Dès que le nom (et le producteur, le millésime) correspond à un vin que vous avez déjà, Glou affiche **Vous avez déjà ce vin** (ou ce spiritueux, ce cigare) avec ce que vous en avez, par cave. Deux choix :
* **Ajouter des bouteilles à ce vin** : le formulaire se réduit au nombre, à la contenance (reprise de votre dernière ligne), à la cave et au prix (pour un cigare : le nombre, et « boîtes de combien » ou « à l'unité »). Les bouteilles rejoignent le vin.
* **C'est un autre vin** : un nouveau vin est créé et Glou ne vous proposera plus de le regrouper avec l'autre. **Retour à la saisie** revient au formulaire.

Le même rappel apparaît quand vous scannez une étiquette, convertissez un souhait en achat ou ajoutez des bouteilles avec l'assistant de démarrage. L'ancien avertissement de doublon, avec son bouton « Incrémenter la quantité », n'existe plus.

### Ajouter des bouteilles à un vin que vous avez déjà
Ouvrez le vin, puis **Ajouter des bouteilles** (**Ajouter des cigares** pour un cigare) : saisissez le nombre, la cave, le prix et la date d'achat. Une ligne se complète seulement si la cave, le prix, la contenance **et la date d'achat** sont les mêmes : un rachat un autre jour donne une ligne à part (« 6 · Garage · 20 € · janv. » et « 2 · Garage · 20 € · juin »), pour que votre budget reste juste. Une ligne compte au plus 1 000 bouteilles.

### Corriger le nombre
Dans le menu d'une ligne, **Corriger le nombre** ne sert qu'à **baisser** le nombre, en précisant pourquoi : **Erreur de saisie** (les bouteilles n'ont jamais existé : elles disparaissent, dépenses comprises) ou **Cassée, offerte ou perdue** (elles quittent la cave et sa valeur mais restent dans les dépenses). Pour en ajouter, utilisez **Ajouter des bouteilles**. Pour une bouteille bue, utilisez **J'en bois une** (voir [04-Gestion-Des-Caves.md](./04-Gestion-Des-Caves.md)). Si la ligne garde moins de bouteilles qu'elle n'occupe de cases du plan de cave, Glou demande **Quelles cases libérer ?** et vous les touchez sur un petit plan ; les bouteilles non rangées partent d'abord, sans question.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Résolution |
| :--- | :--- |
| **Le bouton "+" n'apparaît pas ou est désactivé** | Vous devez d'abord créer au moins une cave. Naviguez dans "Caves" et ajoutez-en une. |
| **Mauvaises suggestions (ex : cigares au lieu de vins)** | Vérifiez que la catégorie sélectionnée à l'étape 1 est bien "Vin" ou "Pétillant" et non une catégorie non-liée. |
| **Champs essentiels manquants (appellation, etc.)** | Dépliez la section optionnelle avec la flèche "Afficher plus" pour accéder aux détails poussés. |
| **Aucune suggestion d'autocomplétion** | Connexion internet requise. Voir la section dépannage de [08-Autocompletion-Image.md](./08-Autocompletion-Image.md). |
| **« Vous avez déjà ce vin » alors que ce n'est pas le même** | Choisissez **C'est un autre vin** : Glou s'en souvient et ne proposera plus de les regrouper. La comparaison porte sur la catégorie, le producteur, le nom et le millésime, sans tenir compte des majuscules ni des espaces. |
| **Mon rachat a créé une deuxième ligne au lieu de s'ajouter à la première** | Une ligne ne se complète que si la cave, le prix, la contenance et la date d'achat sont identiques. Changez-les pour qu'ils correspondent, ou gardez les deux lignes. |
| **« Corriger le nombre » ne permet pas d'augmenter** | Normal : utilisez **Ajouter des bouteilles**. |
| **Ajouter des bouteilles est grisé hors connexion** | L'ajout demande le réseau (voir [25-Mode-Hors-Ligne.md](./25-Mode-Hors-Ligne.md)). |
