# Compléter l'assistant de configuration initiale (onboarding)

## TL;DR
L'assistant d'onboarding guide un nouveau compte pour créer une première cave et charger ses premières bouteilles. Il apparaît automatiquement une fois, et vous pouvez le rouvrir depuis votre profil.

## Prérequis
* Un compte connecté sans cave existante (ou simplement l'envie de le relancer manuellement).

## Action

### Premier lancement
1. Connectez-vous pour la première fois. Si votre compte n'a pas terminé l'onboarding, l'assistant s'ouvre automatiquement en plein écran.
2. **Bienvenue** : choisissez votre langue (FR/EN).
3. **Cave** : créez votre première cave (nom, type de stockage).
4. **Mode d'ingestion** : choisissez parmi :
   - **Scan rapide** : reconnaissance OCR d'étiquette.
   - **Import fichier** : importez un CSV de votre inventaire (voir limites ci-dessous).
   - **Ajout manuel** : ajoutez quelques bouteilles à la main, avec leur nombre. Si le vin est déjà dans votre cave, l'assistant affiche aussi « Vous avez déjà ce vin ».
5. **Résumé** : consultez le nombre de bouteilles (ou de cigares) ajoutées et la cave concernée, puis accédez au tableau de bord.

Vous pouvez passer n'importe quelle étape. Pour quitter l'assistant :

- **Plus tard** (en haut à droite) le ferme jusqu'à votre prochaine connexion, rechargements et autres onglets compris. Il reprend là où vous l'avez laissé, avec la cave qu'il vous a fait créer.
- **Ne plus afficher l'assistant** (en bas) le termine pour de bon. Vous pouvez toujours le relancer depuis votre profil.

Un membre qui rejoint une instance déjà remplie par un autre (au moins une cave, aucune créée par lui) suit une version courte : l'accueil et la langue, puis un écran qui présente les caves et les bouteilles en stock du foyer. Il ne lui est jamais proposé de créer une première cave.

### Relancer l'assistant manuellement
1. Allez dans **Profil**.
2. Cliquez sur **Revoir l'onboarding**.
3. Cela ouvre `/profile?onboarding=1`, qui force l'affichage de l'assistant sans toucher à votre indicateur de complétion. Le relancer n'efface ni votre cave ni vos bouteilles existantes.

### Importer un fichier CSV
L'étape d'import fichier accepte **uniquement le CSV** : il n'y a aucun support `.xlsx`/Excel. Le serveur accepte aussi des fichiers avec le type MIME `application/vnd.ms-excel` (certains exports Windows étiquettent ainsi un simple `.csv`), mais les traite comme du CSV, pas comme un classeur Excel. Le fichier peut être celui de l'[export CSV de votre cave](./19-Sauvegardes-Export-Portabilite-Donnees.md#exporter-votre-cave-en-csv) : il se réimporte tel quel.

| Limite | Valeur |
| :--- | :--- |
| Type de fichier | `.csv` (`text/csv`, ou `application/vnd.ms-excel` envoyé par certains exports Windows pour un fichier `.csv`) |
| Taille max | 2 Mo |
| Lignes max par import | **500 lignes** (quel que soit le nombre de bouteilles qu'elles représentent : une ligne « quantité 200 » compte pour une). L'aperçu d'un fichier plus long le signale et rien n'est importé : scindez le fichier. |
| Colonnes requises | `nom` (≤200 car.), `producteur` (≤200 car.), `catégorie` (`vin`, `bulles`/`champagne`, `spiritueux` ou `cigare`, au singulier ou au pluriel ; `wine`, `sparkling`, `spirit`, `cigar` fonctionnent aussi) |
| Colonnes optionnelles | `millésime` (nombre entier entre 1800 et l'année courante), `prix` (`12,50 €`, `12.50` : celui d'**une** bouteille, d'**une** boîte ou d'**un** cigare), `région`, `quantité` (entier ≥ 1, 1 par défaut), `degré` (0 à 100), `cave`, `date d'achat`, `contenance`, `vitole` et `cigares par boîte` (ou `à l'unité`) pour un cigare, `entamée` / `niveau de remplissage` / `cigares restants` / `date d'ouverture`, `lieu d'achat`, `emplacement`, `valeur estimée`, `à vérifier`, et la description du vin (couleur, appellation, cépages…) |
| Noms de colonnes | Majuscules, accents et espaces sont ignorés ; les en-têtes anglais fonctionnent aussi : `name`, `producer`, `category`, `vintage`, `price`, `region`, `quantity`, `abv`, `cellar`, `purchase date`… |
| Dates | **Jour d'abord** : `15/03/2024`, `15-03-2024`, `15.03.2024` ou `2024-03-15` (années 1900 à 2100). Une date vide est lue comme la date du jour. |

Ce que fait l'import :
* **Une ligne = une ligne de bouteilles** : `quantité` 6 crée une ligne « ×6 ». Les lignes **identiques** du fichier (même vin, même cave, même prix, même contenance, même date d'achat) s'additionnent en une seule. Deux dates d'achat différentes donnent deux lignes.
* Pour un cigare, `quantité` est le nombre de boîtes (ou de cigares à l'unité si `cigares par boîte` vaut `à l'unité`) ; sans colonne `cigares par boîte`, c'est le nombre de cigares d'**une** boîte, comme dans les anciens fichiers.
* **Cave inconnue** : une cave nommée dans le fichier qui n'existe pas est **créée** et annoncée dans le résumé.
* **Vin déjà en cave** : l'aperçu marque la ligne « Vin déjà en cave (6 bouteilles) » et vous laisse choisir **Ajouter ces N bouteilles** ou **Ignorer (déjà comptées)** — **Ignorer par défaut**, pour qu'un second import du même fichier n'ajoute rien. Un vin dont il ne reste aucune bouteille, ou qui est à la corbeille, n'empêche pas d'importer un nouvel achat.
* Si le stock du vin a changé entre l'aperçu et la confirmation (un autre import, un autre membre), la ligne n'est pas importée et le résumé le dit : vérifiez le stock avant de recommencer.
* Un spiritueux importé sans colonne `degré` n'a pas de degré d'alcool (il n'est pas mis à 0 %) ; complétez-le ensuite depuis le formulaire du vin.
* Une cellule de description illisible (une aération « 1 h », une fenêtre « 2025-2030 ») est ignorée sans refuser la ligne. La description d'un vin n'est appliquée qu'à sa **création** : un vin déjà connu n'est jamais modifié par l'import.

L'import se déroule en deux étapes : un **aperçu** valide chaque ligne, annonce le nombre de bouteilles et de lignes que le fichier représente et signale les erreurs sans rien écrire, puis la **confirmation** enregistre toutes les lignes valides dans une transaction unique tout-ou-rien. Les champs remplis depuis le CSV sont marqués avec la source `import_csv` (seulement ceux réellement enregistrés), visible ensuite dans l'historique du vin (voir [18-Transparence-Sources-Historique.md](./18-Transparence-Sources-Historique.md)).

> [!TIP]
> Au-delà de 500 lignes, scindez le fichier en gardant toutes les lignes d'un même vin dans la même partie : importez la première partie, puis rouvrez l'assistant avec **Revoir le guide de démarrage** (Profil) pour importer les suivantes. À partir de la deuxième partie, les vins déjà importés demandent un choix : **Ajouter ces N bouteilles** pour la suite d'un même vin, **Ignorer** sinon.

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **L'assistant réapparaît à chaque connexion** | Vous avez choisi **Plus tard**, qui ne vaut que pour une connexion. Terminez-le, ou cliquez sur **Ne plus afficher l'assistant**. |
| **Mon fichier `.xlsx` a été rejeté** | Les classeurs Excel ne sont pas supportés. Exportez ou enregistrez d'abord le fichier en `.csv`. |
| **L'aperçu refuse mon fichier : trop de lignes** | Le fichier compte plus de 500 lignes (c'est le nombre de lignes qui compte, pas de bouteilles : une ligne avec une quantité de 6 n'en compte qu'une). Scindez-le, puis importez les parties l'une après l'autre (voir l'astuce ci-dessus). |
| **Des lignes « Vin déjà en cave » n'ont pas été importées** | C'est le choix par défaut, **Ignorer (déjà comptées)**, qui évite de compter deux fois les mêmes bouteilles. Pour un nouvel achat, choisissez **Ajouter ces N bouteilles** dans l'aperçu, ou ajoutez-les depuis le vin (**Ajouter des bouteilles**). |
| **L'aperçu affiche des erreurs sur des lignes qui semblent correctes** | Chaque ligne en erreur indique sa raison. Vérifiez que la catégorie est l'une de celles du tableau ci-dessus, et que le nom et le producteur ne sont ni vides ni supérieurs à 200 caractères. |
| **Je veux relancer l'assistant juste pour tester** | Rendez-vous sur `/profile?onboarding=1` ou cliquez sur **Revoir le guide de démarrage** dans votre profil. Cela ne touche pas vos données existantes, et le terminer ou le passer à nouveau ne crée pas de doublons en soi (un vin que vous avez déjà est reconnu à l'ajout : « Vous avez déjà ce vin », voir [05-Ajout-Bouteille.md](./05-Ajout-Bouteille.md)). |
