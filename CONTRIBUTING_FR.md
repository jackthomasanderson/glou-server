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
2. Déplacez la section « Unreleased » de `CHANGELOG.md` sous un nouveau titre `## vYYYY.MM[.PATCH] - YYYY-MM-DD`.
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
```

### Conventions de code

- TypeScript strict partout. `any` n'est pas accepté : typez correctement ou utilisez `unknown` avec un garde de type.
- Nommage métier en anglais, explicite : `fillingLevel`, `peakMaturity`, pas d'abréviations.
- Validation avec Zod pour chaque entrée et sortie d'API.
- La saisie manuelle est prioritaire : l'enrichissement automatique ne doit jamais écraser un champ listé dans `locked_fields`.
- Les écritures en base touchant plusieurs tables passent par un `$transaction` Prisma.
- L'état frontend utilise React Query en stale-while-revalidate ; invalidez les caches liés après chaque mutation réussie.
- Respectez le style du code environnant (nommage, commentaires, structure).

### Internationalisation

Chaque texte visible par l'utilisateur nécessite une clé i18n structurée avec **à la fois** une valeur française et une valeur anglaise. Gardez les fichiers JSON FR/EN synchronisés ; le JSON doit rester valide.

### Tests

Ajoutez ou mettez à jour les tests du comportement que vous modifiez. Les tests d'intégration sur le cycle de vie de la donnée (import → enrichissement → persistance) et sur l'exclusion des `locked_fields` sont prioritaires.

## Messages de commit

Utilisez les [Conventional Commits](https://www.conventionalcommits.org/) : `type: résumé`, ex. `fix: bottles page ignored the user's language preference`. Types courants : `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

Dépôt public : ne référencez jamais de secrets, de contenu `.env`, ou de fichiers gitignorés dans les messages de commit, descriptions de PR ou commentaires d'issue.

## Licence

En contribuant, vous acceptez que vos contributions soient placées sous [licence MIT](LICENSE).
