# 🎯 Glou - Meilleures Pratiques & Piliers d'Expertise

**Version:** 2025.1  
**Contexte:** Gestion professionnelle de cave à vin • Self-hosted • Open-source  
**Auteur:** Agent IA Expert

---

## 📋 Vue d'Ensemble des Piliers

```
┌─────────────────────────────────────────────────────────────────┐
│                    5 PILIERS D'EXCELLENCE                       │
├─────────────────────────────────────────────────────────────────┤
│ 1. Excellence Technique & Code                                  │
│ 2. Tests & Qualité (Confiance)                                  │
│ 3. Architecture & Vision Système                                │
│ 4. Pratiques de Travail & Soft Skills                           │
│ 5. DevOps & Automatisation                                      │
│                                                                  │
│ + SÉCURITÉ (Transversal à tous les piliers)                    │
│ + UI/UX DESIGN (Spécialisation: Web, iOS, Android)            │
│ + DOMAINE (Spécialisation: Gestion de cave)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ EXCELLENCE TECHNIQUE & CODE

### Principes Fondamentaux
- **KISS (Keep It Simple, Stupid):** Préférer lisibilité et simplicité à "élégance cryptique"
- **Boy Scout Rule:** Laisser le code meilleur qu'on l'a trouvé (+1 commit)
- **SOLID & Design Patterns:** Les appliquer avec discernement, pas systématiquement
- **DRY vs WET:** Éviter la répétition, mais sans créer des abstractions prématurées

### Code Go (Glou-Server)
✅ **À Respecter:**
- Erreurs gérées explicitement (pas de `defer recover()` masqué)
- Interfaces petites et ciblées (`io.Reader`, `context.Context`)
- Pas de variables globales (injecter les dépendances)
- Noms descriptifs: `handleGetWineByID` plutôt que `getWine`
- Logging structuré avec contexte

❌ **À Éviter:**
```go
// ❌ Mauvais: cryptique
func (s *S) hGWI(w http.ResponseWriter, r *http.Request) {}

// ✅ Bon: explicite
func (s *Server) handleGetWineByID(w http.ResponseWriter, r *http.Request) {}
```

### Code Frontend (HTML/CSS/JS)
✅ **À Respecter:**
- Variables CSS (Design Tokens) centralisées
- Mobile-First par défaut
- Pas de `!important` sauf cas exceptionnel
- Commentaires seulement pour le "pourquoi", pas le "quoi"
- BEM ou utility-first (Tailwind) pour le CSS

---

## 2️⃣ TESTS & QUALITÉ (LA "CONFIANCE")

### Pyramide des Tests
```
        🔺 E2E (Playwright, Cypress)
       / \
      /   \  Intégration (API, DB)
     /─────\
    /       \  Unitaires
   /_________\
```

### Stratégie pour Glou
| Niveau | Exemple | Target |
|--------|---------|--------|
| **Unitaire** | `TestGetWineByID` | 70% couverture |
| **Intégration** | `TestAPICreateWine` | API endpoints |
| **E2E** | Dashboard → Ajouter vin → Vérifier | Flows critiques |

### Gestion des Bugs
1. ❌ Reproduire le bug
2. ✅ Écrire un test qui le démontre
3. 🔧 Corriger le code
4. ✅ Vérifier que le test passe
5. 📝 Commit: `fix: [bug description] (closes #123)`

### Observabilité
- Logs: Structuré JSON (`"level":"info","ip":"192.168.1.1"`)
- Métriques: `api_request_duration_ms`, `rate_limit_exceeded_total`
- Tracing: Injection de contexte (`r.Context()`)

---

## 3️⃣ ARCHITECTURE & VISION SYSTÈME

### Principes Architecturaux Glou
```
┌──────────────────────────────────────┐
│         Frontend (HTML/CSS/JS)       │
│      (localhost:8080/glou.html)      │
└────────────────┬─────────────────────┘
                 │
        ┌────────▼────────┐
        │   REST API      │
        │ (:8080/wines)   │
        └────────┬────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
[Domain]    [Store]      [Cache]
 Models      SQLite      (Optional)
```

### Design pour Changement
✅ **Découplage:**
- Interface `Store` permet swap SQLite → PostgreSQL
- Middlewares modulaires (Rate Limit, CORS, Logging)
- Configuration centralisée (`.env`)

❌ **À Éviter:**
- Dépendances circulaires
- Références hardcodées (`localhost:8080`)
- Mélange logique métier + HTTP

### Performance
1. Mesurer avec profilers (`pprof`)
2. Identifier vrais goulots (pas d'optimisation prématurée)
3. Cache au besoin (Redis, Memcached)
4. Requêtes DB optimisées (indexes, joins)

### Sécurité = Feature
- ✅ Implementée dès le début
- ✅ CORS restreint (pas `*`)
- ✅ Rate Limiting
- ✅ Timeouts
- ✅ Secrets en `.env`

---

## 4️⃣ PRATIQUES DE TRAVAIL & SOFT SKILLS

### Code Reviews
**Format:** "Je vois que... Pourquoi ne pas... Voici une alternative:"
```
❌ Mauvais: "Ce code est nul"
✅ Bon: "Je vois une boucle imbriquée ici. Aurais-tu envisagé une map 
         pour meilleure performance? Voir: https://..."
```

### Mentorat (Transférer le Savoir)
- Pair programming: 1h/semaine minimum
- Documentation: README clair avec exemples
- Explications du "pourquoi" pas juste le "comment"

### Gestion Conflits Technique
**Situation:** "On doit ajouter une super feature même si ça ajoute de la dette"

**Réponse Senior:**
```
"J'entends l'urgence métier. Voici mon analyse:
- Coût court terme (3 jours): Solution rapide
- Coût long terme: +0.5 jour/sprint de maintenance

Je propose: Faire la quick win MAIS planifier un refactor 
dans le sprint N+2. Créer un ticket de dette technique."
```

### Dire "Non" Constructif
- ✅ "Non car [raison technique/métier]"
- ✅ Proposer alternative
- ✅ Chiffrer l'impact
- ❌ Pas de "C'est impossible"

---

## 5️⃣ DEVOPS & AUTOMATISATION

### CI/CD Pipeline Glou
```yaml
1. Trigger: Push vers main
2. Build: go build
3. Test: go test -cover
4. Lint: golangci-lint
5. Security: govulncheck
6. Docker: Build + Push image
7. Deploy: kubectl apply
```

### Infrastructure as Code
```dockerfile
# ✅ Production-ready
FROM golang:1.24-alpine AS builder
RUN addgroup -g 1000 glou && adduser -D -u 1000 -G glou glou
USER glou
HEALTHCHECK --interval=30s CMD wget http://localhost:8080/health
```

### Post-Mortems (Blameless)
```
Format 5 Whys:
1. "L'API était lente" → Pourquoi?
2. "Pas d'index DB" → Pourquoi?
3. "Tests ne couvraient pas la perf" → Pourquoi?
4. "Pas de benchmark en CI" → Pourquoi?
5. → Action: Ajouter benchmarks au CI
```

---

## 🔒 SÉCURITÉ (TRANSVERSAL)

### Principes
| Domaine | Règle |
|---------|-------|
| **Auth** | MFA + Sessions sécurisées (HttpOnly, Secure) |
| **Entrées** | Valider + Assainir (schemas strictes) |
| **Secrets** | `.env` (jamais commit) |
| **Réseau** | HTTPS/TLS 1.3, CSP, HSTS |
| **DB** | Requêtes préparées (ORM) |
| **Logs** | Pas de PII (emails/IPs masquées) |

### Checklist Glou
- ✅ Rate Limiting implémenté
- ✅ CORS restreint
- ✅ Security Headers (X-Frame-Options, CSP, etc.)
- ✅ Timeouts configurés
- ✅ Body size limité
- ✅ User non-root en Docker
- ⚠️ TODO: Authentification (JWT)
- ⚠️ TODO: HTTPS en prod

---

## 🎨 UI/UX DESIGN (SPÉCIALISATIONS)

### Fondamentaux Transverses
- **Design Tokens:** `:root { --primary: #667eea }` (jamais `#667eea` en dur)
- **Grille 8px:** Padding, margin, dimensions = multiples de 8px (4px micro-ajustements)
- **Accessibilité:** Contraste ≥4.5:1, cibles tactiles ≥44x44pt
- **Hiérarchie:** 1 CTA primaire par écran

### Web (Glou Dashboard)
✅ **Appliqué:**
- Mobile-First responsive
- Mode sombre avec `prefers-color-scheme`
- Tabs responsive
- Stats grid adaptive (1col → 4col)

⚠️ **À Améliorer:**
- [ ] Animations fluides (easing curves)
- [ ] Skeletons loading states
- [ ] Breadcrumbs navigation
- [ ] Keyboard shortcuts (Cmd+K pour search)

### iOS (Future Client)
- Utiliser SF Symbols
- Navigation Bar avec Large Title
- Tab Bar en bas (3-5 icônes max)
- Swipe to dismiss

### Android (Future Client)
- Material Design 3
- Bottom navigation (mobile) / Rail (tablet)
- FAB pour action principale
- Haptic feedback

---

## 🍷 DOMAINE: GESTION DE CAVE (SPÉCIALISATION)

### Reproches Actuels vs Solutions
| Problème | Reproche | Solution |
|----------|----------|----------|
| **UX** | Austère, lent | Mobile-First, mode sombre ✅ |
| **Data** | Saisie manuelle | Vivino API, OCR étiquettes 🔄 |
| **Stocks** | Pas d'alertes | Notifications apogée ✅ |
| **Finance** | Pas de marge | Calcul prix HT/TTC 🔄 |
| **Export** | Pas possible | PDF/QR/CSV 🔄 |

### Roadmap Alignée
```
Sprint 1 ✅  : UI/UX moderne + Mode sombre + Journal de bord
Sprint 2 🔄  : Authentification + API Vivino (reconnaissance étiquette)
Sprint 3 🔄  : Export PDF + Calcul rentabilité
Sprint 4 🔄  : Notifications push + Sync multi-appareils
Sprint 5 🔄  : Client iOS/Android natif
```

---

## 📊 MATRICE DE VALIDATION (CHECKLIST)

### Avant Chaque Commit
```
Code:
  [ ] Pas de console.log() / print() en prod
  [ ] KISS principle respected
  [ ] Boy Scout Rule applied (+1)
  [ ] Noms explicites
  [ ] Pas de copypaste (DRY)

Tests:
  [ ] Unitaires passent (go test)
  [ ] Couverture ≥70%
  [ ] Tests de régression si bugfix

Sécurité:
  [ ] Pas de secrets en code
  [ ] Inputs validés
  [ ] Erreurs gérées (pas panic)
  [ ] Logs sans PII

Docs:
  [ ] README à jour
  [ ] Commande git claire
  [ ] Lien issue si applicable
```

### Avant Merge vers Main
```
Performance:
  [ ] Pas de régression (benchmark)
  [ ] Logs structurés
  [ ] DB queries optimisées

Architecture:
  [ ] Découplage maintenu
  [ ] Pas de dépendances circulaires
  [ ] Configuration centralisée

Déploiement:
  [ ] Docker builds
  [ ] Healthcheck passe
  [ ] Migrations DB testées
```

---

## 🎓 Tableau Senior vs Junior (Contexte Glou)

| Aspect | Junior | Senior |
|--------|--------|--------|
| **Feature** | "Faire marcher" | Maintenable 5 ans |
| **DB** | Une table | Normalisée, indexée |
| **API** | Retour tous les champs | Versioning, pagination |
| **Erreur** | Try/catch générique | Context + logs structurés |
| **Test** | Optionnel | TDD, 70%+ couverture |
| **Bug** | Corriger vite | Comprendre root cause |
| **Unknowns** | Demande instructions | Lève ambiguïtés |
| **Impact** | Sa tâche | Productivité équipe |

---

## 📚 Ressources Réf

- **Code Quality:** Clean Code (Robert Martin)
- **Testing:** Test Driven Development (Kent Beck)
- **Architecture:** Building Microservices (Sam Newman)
- **Security:** OWASP Top 10, CWE Top 25
- **DevOps:** The Phoenix Project (Gene Kim)
- **UX:** Design of Everyday Things (Don Norman)

---

## ✍️ Notes Finales

> *"Un Senior ne code pas plus vite qu'un Junior. Il code mieux, plus lisible, 
> et fait en sorte que le prochain dev qui touche au code soit heureux."*

Cette philosophie guide chaque décision technique dans Glou.

**Validé par:** Agent IA Expert  
**Date:** 2025-12-21  
**Version:** 1.0
