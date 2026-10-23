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
| Lignes max | 500 (les lignes supplémentaires sont silencieusement ignorées ; seules les 500 premières sont lues) |
| Colonnes requises | `nom` (≤200 car.), `producteur` (≤200 car.), `catégorie` (`vin`, `bulles`/`champagne`, `spiritueux` ou `cigare`, au singulier ou au pluriel ; `wine`, `sparkling`, `spirit`, `cigar` fonctionnent aussi) |
| Colonnes optionnelles | `millésime` (nombre entier entre 1800 et l'année courante), `prix` (`12,50 €`, `12.50`), `région`, `quantité` (cigares, entier ≥ 1, 1 par défaut), `degré` (0 à 100) |
| Noms de colonnes | Majuscules, accents et espaces sont ignorés ; les en-têtes anglais fonctionnent aussi : `name`, `producer`, `category`, `vintage`, `price`, `region`, `quantity`, `abv` |

Un spiritueux importé sans colonne `degré` n'a pas de degré d'alcool (il n'est pas mis à 0 %) ; complétez-le ensuite depuis le formulaire de l'actif.

L'import se déroule en deux étapes : un **aperçu** valide chaque ligne et signale les erreurs sans rien écrire, puis la **confirmation** enregistre toutes les lignes valides dans une transaction unique tout-ou-rien. Les champs remplis depuis le CSV sont marqués avec la source `import_csv`, visible ensuite sur la fiche détaillée de l'actif (voir [18-Transparence-Sources-Historique.md](./18-Transparence-Sources-Historique.md)).

> [!TIP]
> Pour plus de 500 lignes ou d'autres colonnes (format, emplacement en cave…), utilisez **l'ajout manuel** pour le premier lot via l'assistant, puis ajoutez le reste en masse depuis l'écran principal d'inventaire une fois l'onboarding terminé. Cet écran n'est pas limité à 500 lignes.

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **L'assistant réapparaît à chaque connexion** | Vous avez choisi **Plus tard**, qui ne vaut que pour une connexion. Terminez-le, ou cliquez sur **Ne plus afficher l'assistant**. |
| **Mon fichier `.xlsx` a été rejeté** | Les classeurs Excel ne sont pas supportés. Exportez ou enregistrez d'abord le fichier en `.csv`. |
| **Seule une partie de mes lignes a été importée** | Vous avez dépassé le plafond de 500 lignes : seules les 500 premières lignes du fichier sont lues. Divisez le fichier et importez le reste ensuite depuis l'écran principal d'inventaire. |
| **L'aperçu affiche des erreurs sur des lignes qui semblent correctes** | Vérifiez que `category` vaut exactement `wine`, `sparkling`, `spirit` ou `cigar` (sensible à la casse), et que `name`/`producer` ne sont ni vides ni supérieurs à 200 caractères. |
| **Je veux relancer l'assistant juste pour tester** | Rendez-vous sur `/profile?onboarding=1` ou cliquez sur **Revoir le guide de démarrage** dans votre profil. Cela ne touche pas vos données existantes, et le terminer ou le passer à nouveau ne crée pas de doublons en soi (la détection de doublons reste active à l'ajout, voir [Recherche Globale](./07-Recherche-Globale.md) si pertinent). |
