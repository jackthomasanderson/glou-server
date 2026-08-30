# Contribuer à Glou

*[English version](CONTRIBUTING.md)*

Merci de votre intérêt pour l'amélioration de Glou ! Ce document explique comment proposer des changements.

## Comment contribuer

- **Signaler un bug** — ouvrez un [rapport de bug](https://github.com/jackthomasanderson/glou-server/issues/new?template=bug_report.yml).
- **Proposer une fonctionnalité** — ouvrez une [proposition](https://github.com/jackthomasanderson/glou-server/issues/new?template=feature_request.yml).
- **Poser une question** — utilisez les [Discussions](https://github.com/jackthomasanderson/glou-server/discussions), pas le suivi d'issues.
- **Signaler une faille** — voir [SECURITY_FR.md](SECURITY_FR.md). N'ouvrez jamais d'issue publique pour un problème de sécurité.

## Organisation du dépôt

| Chemin | Stack |
| --- | --- |
| `api/` | Node.js + TypeScript, Express, Prisma, PostgreSQL, Zod, Vitest |
| `web/` | Next.js (App Router), React Query, Tailwind CSS, HeroUI, Vitest |
| `docs/wiki/` | Documentation utilisateur (FR/EN) |
| `docker-compose*.yml` | Stack de dev locale et auto-hébergée |

## Mise en route

Prérequis : Docker, et Node.js 20 si vous voulez lancer les apps hors conteneurs.

```bash
cp .env.example .env          # définir un JWT_SECRET robuste
docker compose -f docker-compose.dev.yml up -d
```

Pour travailler directement sur un package :

```bash
cd api && npm ci && npm run db:generate && npm run dev
cd web && npm ci && npm run dev
```

## Branches et pull requests

- La branche d'intégration par défaut est **`dev`**. Branchez depuis `dev` et ouvrez votre PR **vers `dev`** — pas `main`.
- `main` suit le code publié ; `dev` est promue vers `main` par le mainteneur.
- Gardez des PR ciblées. Un seul changement logique par PR.
- Nommez la branche de façon parlante, ex. `fix/world-map-basemap` ou `feat/csv-import`.
- Complétez la checklist du template de PR.

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

- **TypeScript strict** partout. `any` n'est pas accepté — typez correctement ou utilisez `unknown` avec un garde de type.
- **Nommage métier en anglais**, explicite : `fillingLevel`, `peakMaturity`, pas d'abréviations.
- **Validation avec Zod** pour chaque entrée et sortie d'API.
- **La saisie manuelle est prioritaire** : l'enrichissement automatique ne doit jamais écraser un champ listé dans `locked_fields`.
- **Les écritures en base** touchant plusieurs tables passent par un `$transaction` Prisma.
- **L'état frontend** utilise React Query en stale-while-revalidate ; invalidez les caches liés après chaque mutation réussie.
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
