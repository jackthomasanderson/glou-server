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
   - **Ajout manuel** : ajoutez quelques bouteilles à la main.
5. **Résumé** : consultez le nombre d'actifs ajoutés et la cave concernée, puis accédez au tableau de bord.

Vous pouvez passer n'importe quelle étape. Pour quitter l'assistant :

- **Plus tard** (en haut à droite) le ferme jusqu'à votre prochaine connexion, rechargements et autres onglets compris. Il reprend là où vous l'avez laissé, avec la cave qu'il vous a fait créer.
- **Ne plus afficher l'assistant** (en bas) le termine pour de bon. Vous pouvez toujours le relancer depuis votre profil.

Un membre qui rejoint une instance déjà remplie par un autre (au moins une cave, aucune créée par lui) suit une version courte : l'accueil et la langue, puis un écran qui présente les caves et les bouteilles en stock du foyer. Il ne lui est jamais proposé de créer une première cave.

### Relancer l'assistant manuellement
1. Allez dans **Profil**.
2. Cliquez sur **Revoir l'onboarding**.
3. Cela ouvre `/profile?onboarding=1`, qui force l'affichage de l'assistant sans toucher à votre indicateur de complétion. Le relancer n'efface ni votre cave ni vos bouteilles existantes.

### Limites de l'import CSV
L'étape d'import fichier accepte **uniquement le CSV** : il n'y a aucun support `.xlsx`/Excel. Le serveur accepte aussi des fichiers avec le type MIME `application/vnd.ms-excel` (certains exports Windows étiquettent ainsi un simple `.csv`), mais les traite comme du CSV, pas comme un classeur Excel.

| Limite | Valeur |
| :--- | :--- |
| Type de fichier | `.csv` (`text/csv`, ou `application/vnd.ms-excel` envoyé par certains exports Windows pour un fichier `.csv`) |
| Taille max | 2 Mo |
| Actifs max par import | 500 (une bouteille, ou une boîte pour les cigares). L'aperçu d'un fichier qui en représente davantage le signale et l'import n'est pas possible : scindez le fichier. |
| Colonnes requises | `nom` (≤200 car.), `producteur` (≤200 car.), `catégorie` (`vin`, `bulles`/`champagne`, `spiritueux` ou `cigare`, au singulier ou au pluriel ; `wine`, `sparkling`, `spirit`, `cigar` fonctionnent aussi) |
| Colonnes optionnelles | `millésime` (nombre entier entre 1800 et l'année courante), `prix` (`12,50 €`, `12.50`), `région`, `quantité` (entier ≥ 1, 1 par défaut : nombre de bouteilles pour un vin, des bulles ou un spiritueux, qui crée autant d'actifs ; nombre de cigares de la boîte pour un cigare, qui crée une seule boîte), `degré` (0 à 100) |
| Noms de colonnes | Majuscules, accents et espaces sont ignorés ; les en-têtes anglais fonctionnent aussi : `name`, `producer`, `category`, `vintage`, `price`, `region`, `quantity`, `abv` |

Un spiritueux importé sans colonne `degré` n'a pas de degré d'alcool (il n'est pas mis à 0 %) ; complétez-le ensuite depuis le formulaire de l'actif.

Un carton de 6 s'écrit au choix sur une ligne avec `quantité` = 6, ou sur six lignes identiques : les deux donnent 6 bouteilles. Une ligne n'est **pas importée** quand la même bouteille était **en stock avant l'import** : même producteur et même nom ; pour un vin ou des bulles, même millésime ou millésime absent d'un côté. Une bouteille en stock dont la contenance (ou, pour un cigare, le format) est renseignée n'est pas reconnue, l'import ne lisant pas ces colonnes ; le résumé l'indique (« déjà en stock avant l'import »). Les lignes d'un même fichier ne se comparent jamais entre elles, et une bouteille finie, une référence non détenue ou une bouteille à la corbeille n'empêchent pas d'importer un nouvel achat du même vin.

L'import se déroule en deux étapes : un **aperçu** valide chaque ligne, annonce le nombre d'actifs que le fichier représente et signale les erreurs sans rien écrire, puis la **confirmation** enregistre toutes les lignes valides dans une transaction unique tout-ou-rien. Les champs remplis depuis le CSV sont marqués avec la source `import_csv` (seulement ceux réellement enregistrés : la quantité d'un vin, qui devient un nombre de bouteilles, ne l'est pas), visible ensuite sur la fiche détaillée de l'actif (voir [18-Transparence-Sources-Historique.md](./18-Transparence-Sources-Historique.md)).

> [!TIP]
> Au-delà de 500 actifs, scindez le fichier en gardant toutes les lignes d'un même vin dans la même partie (sinon, la seconde partie trouverait ce vin déjà en stock et ne l'importerait pas) : importez la première partie, puis rouvrez l'assistant avec **Revoir le guide de démarrage** (Profil) pour importer les suivantes. Pour d'autres colonnes (format, emplacement en cave…), complétez les fiches après l'import.

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **L'assistant réapparaît à chaque connexion** | Vous avez choisi **Plus tard**, qui ne vaut que pour une connexion. Terminez-le, ou cliquez sur **Ne plus afficher l'assistant**. |
| **Mon fichier `.xlsx` a été rejeté** | Les classeurs Excel ne sont pas supportés. Exportez ou enregistrez d'abord le fichier en `.csv`. |
| **L'aperçu refuse mon fichier : trop d'actifs** | Le fichier représente plus de 500 actifs (une ligne avec une quantité de 6 en compte 6). Scindez-le, puis importez les parties l'une après l'autre (voir l'astuce ci-dessus). |
| **Des lignes « déjà en stock avant l'import » n'ont pas été importées** | La même bouteille était déjà en stock avant l'import (y compris depuis une partie précédente du même fichier). Si c'est un nouvel achat, ajoutez-le depuis l'inventaire. |
| **L'aperçu affiche des erreurs sur des lignes qui semblent correctes** | Chaque ligne en erreur indique sa raison. Vérifiez que la catégorie est l'une de celles du tableau ci-dessus, et que le nom et le producteur ne sont ni vides ni supérieurs à 200 caractères. |
| **Je veux relancer l'assistant juste pour tester** | Rendez-vous sur `/profile?onboarding=1` ou cliquez sur **Revoir le guide de démarrage** dans votre profil. Cela ne touche pas vos données existantes, et le terminer ou le passer à nouveau ne crée pas de doublons en soi (la détection de doublons reste active à l'ajout, voir [Recherche Globale](./07-Recherche-Globale.md) si pertinent). |
