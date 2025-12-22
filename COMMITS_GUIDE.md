# 📝 Guide des Commits et Versioning

## Format des Commits (Conventional Commits)

### Structure
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types autorisés

| Type | Signification | Version |
|------|---------------|---------|
| `feat` | Nouvelle fonctionnalité | `minor` (v1.0.0 → v1.1.0) |
| `fix` | Correction de bug | `patch` (v1.0.0 → v1.0.1) |
| `perf` | Amélioration de performance | `patch` |
| `refactor` | Refactorisation | `patch` |
| `test` | Ajout/modification de tests | `patch` |
| `docs` | Documentation | `patch` |
| `ci` | CI/CD | `patch` |
| `chore` | Maintenance (deps, etc) | `patch` |
| `style` | Formatage (whitespace, etc) | IGNORÉ |

### Breaking Change (MAJEUR)

Ajouter `!` ou `BREAKING CHANGE:` pour une version **majeure** (v1.0.0 → v2.0.0)

```
feat!: change API response format
```

ou

```
feat(api): change response format

BREAKING CHANGE: The /users endpoint now returns an array instead of object
```

---

## Exemples de commits

### ✅ BON
```
feat(search): add wine search by grape type

Allow users to filter wines by their primary grape variety
```

```
fix(auth): correct session timeout not being respected

The session timeout configuration was being ignored in the auth handler
```

```
feat!: migrate database schema to PostgreSQL

BREAKING CHANGE: SQLite is no longer supported, migration required
```

### ❌ MAUVAIS
```
Update stuff
```

```
fix bug
```

```
WIP: stuff
```

---

## Créer une release

### Pour une release finale (ex: v1.0.0)
```bash
git tag v1.0.0
git push origin v1.0.0
```
→ `build-push-action` crée image `latest` et `v1.0.0`

### Pour une beta (ex: v2.0.0-beta.1)
```bash
git tag v2.0.0-beta.1
git push origin v2.0.0-beta.1
```
→ `build-push-action` crée image `beta` et `v2.0.0-beta.1`

### Pour une release candidate (ex: v2.0.0-rc.1)
```bash
git tag v2.0.0-rc.1
git push origin v2.0.0-rc.1
```
→ `build-push-action` crée image `beta` et `v2.0.0-rc.1`

---

## Workflow complet

1. **Développement** sur `develop`
   ```bash
   git commit -m "feat: add feature X"
   git push origin develop
   ```
   → `build-nightly.yml` lance build + Docker nightly

2. **Merge vers main** quand prêt
   ```bash
   git switch main
   git merge develop
   git push origin main
   ```
   → `ci.yml` fait juste tests (pas de Docker build)

3. **Créer une release**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   → `release.yml` lance build + Docker `latest` + Goreleaser

---

## Vérifier votre commit

Avant de push :
```bash
# Vérifier le format
git log --oneline -10

# Devrait ressembler à:
# a1b2c3d feat(wine): add vintage filtering
# d4e5f6g fix: resolve memory leak in cellar loader
```

---

## Tips

- **Ne commitez jamais avec `git commit -m`** seul → utiliser un éditeur
- **Lisez les PRs des autres** pour apprendre le style
- **Scope optionnel** : feat(auth) ou feat(api) ou feat
- **Emoji optionnel** : certaines équipes utilisent 🎉 feat, 🐛 fix, etc.
