# Contribuer à Glou

*[English version](CONTRIBUTING.md)*

Ce document explique comment proposer des changements à Glou.

## Comment contribuer

- Signaler un bug : ouvrez un [rapport de bug](https://github.com/jackthomasanderson/glou-server/issues/new?template=bug_report.yml).
- Proposer une fonctionnalité : ouvrez une [proposition](https://github.com/jackthomasanderson/glou-server/issues/new?template=feature_request.yml).
- Poser une question : utilisez les [Discussions](https://github.com/jackthomasanderson/glou-server/discussions), pas le suivi d'issues.
- Signaler une faille : voir [SECURITY_FR.md](SECURITY_FR.md). N'ouvrez jamais d'issue publique pour un problème de sécurité.

## Organisation du dépôt

| Chemin | Stack |
| --- | --- |
| `api/` | Node.js + TypeScript, Express, Prisma, PostgreSQL, Zod, Vitest |
| `web/` | Next.js (App Router), React Query, Tailwind CSS, HeroUI, Vitest |
| `shared/` | Contrats TypeScript lus par `api/` et `web/` (sans dépendance) |
| `docs/wiki/` | Documentation utilisateur (FR/EN) |
| `docker-compose*.yml` | Stack de dev locale et auto-hébergée |

## Mise en route

Prérequis : Docker, et Node.js 24 si vous voulez lancer les apps hors conteneurs.

```bash
cp .env.example .env          # définir un JWT_SECRET robuste
docker compose -f docker-compose.dev.yml up -d
```

La pile de développement n'écoute que sur cette machine (http://localhost:3000, API sur le port 3001) : elle tourne en mode développement, où les secrets d'exemple sont acceptés.

Pour travailler directement sur un package :

```bash
cd api && npm ci && npm run db:generate && npm run dev
cd web && npm ci && npm run dev
```

**Contrats partagés.** `shared/` contient les contrats TypeScript que lisent les deux packages : formes de réponse, listes de valeurs, constantes de règles. Importez-les au lieu de les redéclarer — par chemin relatif dans `api/` (`../../../shared/auth`), sous la forme `@shared/auth` dans `web/`. Les fichiers de ce dossier n'importent rien d'autre qu'eux-mêmes : ni package npm, ni Prisma, ni zod. Pour construire une image à la main, passez le dossier comme contexte nommé : `docker build --build-context shared=./shared ./api`.

## Branches et pull requests

- La branche d'intégration par défaut est **`dev`**. Branchez depuis `dev` et ouvrez votre PR **vers `dev`**, pas `main`.
- `main` suit le code publié ; `dev` est promue vers `main` par le mainteneur.
- Gardez des PR ciblées. Un seul changement logique par PR.
- Nommez la branche de façon parlante, ex. `fix/world-map-basemap` ou `feat/csv-import`.
- Complétez la checklist du template de PR.

## Versionnage

Glou utilise le Calendar Versioning : `YYYY.MM[.PATCH]` (ex. `2026.10.0`), pas le semver — il n'y a pas de contrat de compatibilité d'API à signaler, ni de semantic-release automatisé. `api/package.json` et `web/package.json` portent toujours la même version.

À chaque promotion de `dev` vers `main` (action du mainteneur) :

1. Incrémentez les deux `package.json` vers `YYYY.MM.0` courant, ou incrémentez `PATCH` si une version est déjà sortie ce mois-ci.
2. Déplacez la section « Unreleased » de `CHANGELOG.md` sous un nouveau titre `## vYYYY.MM[.PATCH] - YYYY-MM-DD`, et les notes `## Upcoming` / `## À venir` de `api/release-notes/RELEASE_NOTES.en.md` et `.fr.md` sous un nouveau titre `## vYYYY.MM[.PATCH]` dans les deux fichiers, en laissant les deux sections à venir vides.
3. Taguez `main` à ce commit : `git tag vYYYY.MM[.PATCH] && git push origin vYYYY.MM[.PATCH]`.
4. La CI (`docker-publish.yml`) publie cette même version comme tag d'image supplémentaire sur `main`, en plus de `latest`.

## Contrôles qualité

La CI (`.github/workflows/docker-publish.yml`) s'exécute à chaque push sur `dev` et `main` et **doit être verte** avant un merge. Lancez les mêmes contrôles en local :

```bash
# api/
npm run typecheck      # tsc --noEmit — strict, aucun `any`
npm run lint           # eslint
npm test               # vitest

# web/
npm run lint
npm test

# e2e/
npm run typecheck      # les specs Playwright sont aussi vérifiées
```

### Conventions de code

- TypeScript strict partout. `any` n'est pas accepté : typez correctement ou utilisez `unknown` avec un garde de type.
- Nommage métier en anglais, explicite : `fillingLevel`, `peakMaturity`, pas d'abréviations.
- Validation avec Zod pour chaque entrée et sortie d'API.
- La saisie manuelle est prioritaire : l'enrichissement automatique ne doit jamais écraser un champ listé dans `locked_fields`.
- Les écritures en base touchant plusieurs tables passent par un `$transaction` Prisma.
- L'état frontend utilise React Query en stale-while-revalidate ; invalidez les caches liés après chaque mutation réussie.
- Respectez le style du code environnant (nommage, commentaires, structure).

### Invariants du modèle de données

Ces règles valent pour tout le code ; un changement qui en casse une est un bug, pas un choix de style.

- **Un seul inventaire partagé par instance.** Un déploiement Glou a un inventaire unique, partagé par tous ses membres ; il n'y a pas de cave par utilisateur. Tout membre authentifié lit et écrit toutes les caves, familles et articles.
- **`userId` sur l'inventaire est un champ d'audit, jamais un filtre d'accès.** Sur `Cellar`, `Product`, `InventoryItem`, `TastingNote`, `InventoryCountSession`, `BudgetEnvelope` et `HumidorReading`, il indique qui a créé la ligne. Ne filtrez ni ne restreignez jamais la lecture ou l'écriture de l'inventaire par `userId`, et ne supprimez jamais des lignes partagées parce que leur créateur est parti.
- **Les entités personnelles sont l'exception.** `ConsumptionGoal`, `WishlistItem`, `BulkPreset`, `ScanJob` et `Collection` appartiennent à un membre et sont filtrées par `userId` volontairement. Une collection regroupe des familles partagées (`Product`) mais est elle-même personnelle. Calculer un agrégat personnel à partir de l'inventaire partagé (par exemple « ce que j'ai bu ce mois-ci ») est permis tant qu'il ne masque l'inventaire à personne.
- **Famille, groupe, sous-fiche.** Une famille (`Product`) porte la description d'un vin, d'un spiritueux ou d'un cigare (producteur, nom, millésime, apogée, notes, photo, collections). Ses bouteilles ou cigares physiques sont des lignes `InventoryItem` : un groupe de N exemplaires identiques (`quantity`), ou une sous-fiche (`quantity = 1`, `parentItemId` vers le groupe d'origine) dès qu'un exemplaire a son propre état (entamé, fini, à moitié fumé). Ne supposez jamais « une ligne = une bouteille ».
- **Comptez avec `itemUnits`.** Tout compte, valeur ou dépense passe par les fonctions pures de `shared/units.ts` (`itemUnits` et consorts), jamais par `count(*)` ni une somme de `quantity` sur les lignes. « En stock » se dit `IN_STOCK_ITEM_FILTER` (`api/src/lib/finished-item.ts`) ; ne reconstruisez pas ce périmètre à la main.
- **Les contrats partagés vivent dans `shared/`.** Un type ou une constante lus par `api/` et `web/` est déclaré une seule fois dans `shared/` (sans dépendance, sans Zod, sans types Prisma) et jamais recopié à la main.
- **Les migrations ne vont qu'en avant.** Changez le schéma avec Prisma Migrate ; il n'existe pas de migration « inverse ». L'API sauvegarde avant d'appliquer des migrations en attente, et revenir en arrière signifie restaurer cette sauvegarde.

### Internationalisation

Chaque texte visible par l'utilisateur nécessite une clé i18n structurée avec **à la fois** une valeur française et une valeur anglaise. Gardez les fichiers JSON FR/EN synchronisés ; le JSON doit rester valide.

### Notes de version

Un changement visible des utilisateurs ajoute, à côté de son entrée au `CHANGELOG.md`, une ligne de texte simple sous `## Upcoming` dans `api/release-notes/RELEASE_NOTES.en.md` et la même sous `## À venir` dans `RELEASE_NOTES.fr.md`, dans la même rubrique (Points d'attention, Sécurité, Nouveautés, Améliorations, Corrections, Retiré). Les administrateurs les lisent dans la fenêtre **Quoi de neuf ?** après une mise à jour : écrivez pour eux, plus court que le journal des modifications ; les points d'attention disent seulement ce qu'il reste à faire *après* la mise à jour. `npm test` dans `api/` échoue si les deux fichiers n'ont pas les mêmes versions, rubriques et nombres de notes.

### Tests

Ajoutez ou mettez à jour les tests du comportement que vous modifiez. Les tests d'intégration sur le cycle de vie de la donnée (import → enrichissement → persistance) et sur l'exclusion des `locked_fields` sont prioritaires.

## Messages de commit

Utilisez les [Conventional Commits](https://www.conventionalcommits.org/) : `type: résumé`, ex. `fix: bottles page ignored the user's language preference`. Types courants : `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

Dépôt public : ne référencez jamais de secrets, de contenu `.env`, ou de fichiers gitignorés dans les messages de commit, descriptions de PR ou commentaires d'issue.

## Licence

Glou est sous [licence PolyForm Noncommercial 1.0.0](LICENSE). Avant que votre première pull request puisse être fusionnée, signez le [contrat de licence de contributeur](CLA.md) (CLA, en anglais) : le robot CLA assistant commente la pull request avec un lien, et une seule signature couvre vos contributions suivantes sous cette version du CLA. Vous gardez le droit d'auteur sur votre travail, mais vous accordez au mainteneur une licence large et irrévocable pour l'utiliser et le concéder à d'autres à toutes conditions, y compris commerciales et propriétaires. Lisez le CLA avant de signer (seule la version anglaise fait foi). Si votre employeur ou une autre structure peut avoir des droits sur votre travail, elle doit autoriser votre contribution par écrit (section 7 du CLA). Une nouvelle version du CLA doit être signée à nouveau pour les contributions suivantes.
