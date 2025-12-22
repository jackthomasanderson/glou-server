# 🚀 Nouvelle Architecture CI/CD

## Status actuel (23 décembre 2025)

✅ **Tous les workflows ont été reconfigurés**

---

## 📋 Workflows en place

### 1. **ci.yml** (existant - gardé inchangé)
- ✅ Déclenché sur : PR vers `main`, push sur `main`
- ✅ Actions : Build + Tests Go
- ✅ Pas de Docker push
- ✅ Goreleaser pour les releases binaires (sur tags)

### 2. **build-nightly.yml** (NOUVEAU)
- ✅ Déclenché sur : `push` sur `develop`
- ✅ Actions :
  - Build + Tests Go
  - Build Docker multi-arch (amd64, arm64)
  - Push image avec tags :
    - `nightly-YYYYMMDD` (ex: nightly-20251223)
    - `nightly` (pointeur vers la dernière)
- 📍 Registry : `ghcr.io/glou-server`

### 3. **release.yml** (NOUVEAU)
- ✅ Déclenché sur : `git tag` (v*.*.*)
- ✅ Actions :
  - Build + Tests Go
  - Build Docker multi-arch (amd64, arm64)
  - Détection type de release :
    - **Si `v*.*.* -beta/-alpha/-rc`** → Images : `beta` + `v2.0.0-beta.1`
    - **Si `v*.*.*` stable** → Images : `latest` + `v1.0.0`
  - Goreleaser pour les binaires
- 📍 Registry : `ghcr.io/glou-server`

---

## 🔄 Workflow complet

```
1️⃣ DÉVELOPPEMENT
   └─ git commit -m "feat(wine): add filters"
   └─ git push origin develop
       └─ build-nightly.yml lance
       └─ Image créée: ghcr.io/glou-server:nightly-20251223

2️⃣ MERGE VERS MAIN
   └─ git merge develop
   └─ git push origin main
       └─ ci.yml lance (build + tests)
       └─ Pas de new Docker image

3️⃣ CRÉER UNE RELEASE
   └─ git tag v1.0.0
   └─ git push origin v1.0.0
       └─ release.yml lance
       └─ Images créées:
          - ghcr.io/glou-server:latest
          - ghcr.io/glou-server:v1.0.0

4️⃣ CRÉER UNE BETA
   └─ git tag v2.0.0-beta.1
   └─ git push origin v2.0.0-beta.1
       └─ release.yml lance
       └─ Images créées:
          - ghcr.io/glou-server:beta
          - ghcr.io/glou-server:v2.0.0-beta.1
```

---

## 📦 Images disponibles

| Image | Quand ? | Utilité |
|-------|---------|---------|
| `latest` | `git tag v1.0.0` | Production actuelle |
| `beta` | `git tag v2.0.0-beta.1` | Pré-release / Beta testing |
| `nightly` | `git push develop` | Développement / Tests |
| `nightly-YYYYMMDD` | `git push develop` | Archive datée |
| `v1.0.0` | `git tag v1.0.0` | Version archivée |

---

## 🎯 Commandes típiques pour vous

### Développer
```bash
git checkout develop
git commit -m "feat(search): add advanced filters"
git push origin develop
# → nightly image créée automatiquement
```

### Preparer une release
```bash
git checkout main
git merge develop
git tag v1.0.0
git push origin v1.0.0
# → latest image créée automatiquement
```

### Faire une beta
```bash
git tag v2.0.0-beta.1
git push origin v2.0.0-beta.1
# → beta image créée automatiquement
```

---

## 📝 Convention des commits

**Format obligatoire pour les commits :**
```
<type>(<scope>): <description>
```

**Types autorisés :**
- `feat:` Nouvelle fonctionnalité
- `fix:` Correction de bug
- `perf:` Amélioration de performance
- `refactor:` Refactorisation
- `test:` Tests
- `docs:` Documentation
- `ci:` CI/CD
- `chore:` Maintenance

**Exemples :**
```bash
git commit -m "feat(wine): add search by region"
git commit -m "fix(auth): resolve session bug"
git commit -m "docs: update README"
```

👉 **Lire [COMMITS_GUIDE.md](./COMMITS_GUIDE.md) pour plus de détails**

---

## 🐳 Docker Compose

**Avant :**
```yaml
image: glou-server:alpha  # Local
```

**Après :**
```yaml
image: ghcr.io/glou-server:latest  # Remote registry
```

La production pointe toujours sur `latest` - pas de redéploiement nécessaire après une release, Docker tire automatiquement la nouvelle version.

---

## ✅ Checklist avant de déployer

```bash
# 1. Vérifier que tout est sur develop
git checkout develop
git pull origin develop

# 2. Merge vers main
git checkout main
git merge develop

# 3. Créer un tag
git tag v1.0.0

# 4. Push (déclenche les workflows)
git push origin main
git push origin v1.0.0

# 5. Vérifier sur GitHub
# → Actions tab → voir les workflows tourner
# → Releases tab → voir la release créée
# → Packages tab → voir l'image Docker uploadée
```

---

## 🔗 Ressources

- [COMMITS_GUIDE.md](./COMMITS_GUIDE.md) - Guide des conventions de commit
- [GitHub Actions Workflows](.github/workflows/) - Les workflows détaillés
- [Docker Hub Package](https://github.com/orgs/your-org/packages) - Les images Docker

---

## 🎉 Voilà !

Vous avez maintenant une CI/CD professionnelle, scalable et facile à maintenir !

Toute question ? 👉 Regardez les logs des workflows sur GitHub Actions.
