# Compléter l'Assistant de Configuration Initiale (Onboarding)

## TL;DR
L'assistant d'onboarding guide un nouveau compte pour créer une première cave et charger ses premières bouteilles — il apparaît automatiquement une fois, et vous pouvez le relancer à tout moment depuis votre profil.

## Prérequis
* Un compte connecté sans cave existante (ou simplement l'envie de le relancer manuellement).

## Action

### Premier lancement
1. Connectez-vous pour la première fois. Si votre compte n'a pas terminé l'onboarding, l'assistant s'ouvre automatiquement en plein écran.
2. **Bienvenue** — choisissez votre langue (FR/EN).
3. **Cave** — créez votre première cave (nom, type de stockage).
4. **Mode d'ingestion** — choisissez parmi :
   - **Scan rapide** — reconnaissance OCR d'étiquette.
   - **Import fichier** — importez un CSV de votre inventaire (voir limites ci-dessous).
   - **Ajout manuel** — ajoutez quelques bouteilles à la main.
5. **Résumé** — consultez le nombre d'actifs ajoutés et la cave concernée, puis accédez au tableau de bord.

Vous pouvez passer n'importe quelle étape, ou fermer l'assistant pour y revenir plus tard — le fermer avant la fin ne le marque pas comme terminé, il réapparaîtra donc à votre prochaine connexion.

### Relancer l'assistant manuellement
1. Allez dans **Profil**.
2. Cliquez sur **Revoir l'onboarding**.
3. Cela ouvre `/profile?onboarding=1`, qui force l'affichage de l'assistant sans toucher à votre indicateur de complétion — le relancer n'efface ni votre cave ni vos bouteilles existantes.

### Limites de l'import CSV
L'étape d'import fichier accepte **uniquement le CSV** — il n'y a aucun support `.xlsx`/Excel, même si le serveur accepte aussi des fichiers avec le type MIME `application/vnd.ms-excel` (certains exports Windows étiquettent ainsi un simple `.csv` ; il est quand même traité comme du CSV, pas comme un vrai classeur Excel).

| Limite | Valeur |
| :--- | :--- |
| Type de fichier | `.csv` (`text/csv`, ou `application/vnd.ms-excel` envoyé par certains exports Windows pour un fichier `.csv`) |
| Taille max | 2 Mo |
| Lignes max | 500 (les lignes supplémentaires sont silencieusement ignorées — seules les 500 premières sont lues) |
| Colonnes requises | `name` (≤200 car.), `producer` (≤200 car.), `category` (`wine`, `sparkling`, `spirit` ou `cigar`) |
| Colonne optionnelle | `vintage` (nombre entier entre 1800 et l'année courante) |

L'import se déroule en deux étapes : un **aperçu** valide chaque ligne et signale les erreurs sans rien écrire, puis la **confirmation** enregistre toutes les lignes valides dans une transaction unique tout-ou-rien. Les champs remplis depuis le CSV sont marqués avec la source `import_csv`, visible ensuite sur la fiche détaillée de l'actif (voir [18-Transparence-Sources-Historique.md](./18-Transparence-Sources-Historique.md)).

> [!TIP]
> Besoin de plus de 500 lignes ou de colonnes plus riches (région, prix, quantité, format...) ? Utilisez **l'ajout manuel** pour le premier lot via l'assistant, puis ajoutez le reste en masse depuis l'écran principal d'inventaire une fois l'onboarding terminé — celui-ci n'est pas limité à 500 lignes.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **L'assistant réapparaît à chaque connexion** | Vous l'avez fermé sans le terminer ni cliquer sur Passer. Terminez une étape ou passez-la explicitement pour définir l'indicateur de complétion — fermer simplement l'onglet du navigateur ne compte pas. |
| **Mon fichier `.xlsx` a été rejeté** | Les classeurs Excel ne sont pas supportés. Exportez/enregistrez d'abord le fichier en `.csv`. |
| **Seule une partie de mes lignes a été importée** | Vous avez dépassé le plafond de 500 lignes — seules les 500 premières lignes du fichier sont lues. Divisez le fichier et importez le reste ensuite depuis l'écran principal d'inventaire. |
| **L'aperçu affiche des erreurs sur des lignes qui semblent correctes** | Vérifiez que `category` vaut exactement `wine`, `sparkling`, `spirit` ou `cigar` (sensible à la casse), et que `name`/`producer` ne sont ni vides ni supérieurs à 200 caractères. |
| **Je veux relancer l'assistant juste pour tester** | Rendez-vous sur `/profile?onboarding=1` ou cliquez sur **Revoir l'onboarding** dans votre profil — cela ne touche pas vos données existantes, et le terminer/passer à nouveau ne crée pas de doublons en soi (la détection de doublons reste active à l'ajout, voir [Recherche Globale](./07-Recherche-Globale.md) si pertinent). |
