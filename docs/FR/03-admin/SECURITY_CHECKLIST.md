# 🔒 SECURITY VALIDATION CHECKLIST - Glou

**Contexte:** Self-hosted wine management app • Données personnelles sensibles

---

## 🛡️ NIVEAU 1: FONDAMENTAUX (CRITIQUES)

### Secrets Management
- [ ] Aucune clé API en code source
- [ ] `.env` dans `.gitignore`
- [ ] Secrets chargés uniquement via variables d'environnement
- [ ] Serveur test: credentials séparées de prod
- [ ] Rotation des secrets planifiée

### Authentification (Phase 2 TODO)
- [ ] MFA implémenté (TOTP ou SMS)
- [ ] Passwords ≥12 caractères avec complexité
- [ ] Sessions: HttpOnly + Secure + SameSite=Strict
- [ ] Token expiration < 24h (si JWT)
- [ ] Refresh tokens séparés de access tokens

### Chiffrement
- [ ] TLS 1.3 forcé en production
- [ ] Certificats auto-signés en dev, valides en prod
- [ ] Données sensibles chiffrées au repos (AES-256)
- [ ] Clés chiffrement stockées en coffre (pas en code)

---

## 🌐 NIVEAU 2: RÉSEAU & COMMUNICATION

### CORS
- ✅ Whitelist stricte (pas `*`)
- ✅ Origines validées: `localhost:8080` (dev), `glou.example.com` (prod)
- ✅ Credentials explicitement autorisés si nécessaire
- ✅ Preflight request duration correct (3600s)

### HTTP Headers
- ✅ `X-Frame-Options: DENY` (prevent clickjacking)
- ✅ `X-Content-Type-Options: nosniff` (prevent MIME sniffing)
- ✅ `X-XSS-Protection: 1; mode=block`
- ✅ `Referrer-Policy: strict-origin-when-cross-origin`
- ✅ `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- ✅ `Content-Security-Policy: default-src 'self'` (si applicable)
- ✅ `Strict-Transport-Security: max-age=31536000` (prod only)

### Requêtes HTTP
- [ ] Timeouts configurés (30s par défaut)
- [ ] Body size limité (1 MB)
- [ ] Rate limiting: 100 req/min par IP
- [ ] Pas de HTTP (HTTPS seulement en prod)

---

## 🗄️ NIVEAU 3: BASE DE DONNÉES & DONNÉES

### Validation Entrées
- [ ] Schémas de validation strictes (ex: jsonschema)
- [ ] Sanitization de tous inputs utilisateur
- [ ] Pas de query strings concaténés (prepared statements ALWAYS)
- [ ] Validation côté serveur (jamais confier au client)

### Requêtes SQL
- [ ] Parameterized queries pour TOUT (`?` placeholders)
- [ ] Indexes sur colonnes WHERE/JOIN
- [ ] LIMIT sur résultats (prev pagination)
- [ ] Pas d'accès direct aux raw DB credentials en code

### Protection PII (Données Personnelles)
- [ ] Identifiants utilisateurs jamais en logs
- [ ] Emails masqués dans les traces (`u***@example.com`)
- [ ] IPs seulement en logs de sécurité (pas partout)
- [ ] Dates de naissance jamais loggées
- [ ] GDPR compliance: droit à l'oubli implémenté

### Backups
- [ ] Backups chiffrés
- [ ] Tests de restore réguliers
- [ ] Rétention politiques claires
- [ ] Hors-site backup

---

## 🐳 NIVEAU 4: INFRASTRUCTURE & DÉPLOIEMENT

### Docker Security
- ✅ User non-root (`USER glou`)
- ✅ Image de base minimale (`alpine:3.19`)
- ✅ Scan de vulnérabilités (`trivy` ou `snyk`)
- ✅ Pas de `RUN apt-get update` sans `--no-install-recommends`
- [ ] Secret management (Docker secrets, pas env vars)

### Permissions Fichiers
- [ ] Fichiers config: `0600` (user only)
- [ ] Répertoires: `0700`
- [ ] Database file: `0600`
- [ ] Logs: `0640` (user:group)

### Monitoring & Alerting
- [ ] Logs centralisés (ELK, Datadog, etc.)
- [ ] Alertes sur erreurs de sécurité
- [ ] Monitoring des rates limits triggérés
- [ ] Alertes sur tentatives d'accès non autorisé

---

## 📱 NIVEAU 5: SPÉCIFIQUE GLOU (CAVE)

### Données Sensibles
- [ ] Prix d'achat (données financières) protégés
- [ ] Localisation cave (si GPS) sécurisée
- [ ] Données de dégustation personnelles chiffrées
- [ ] Export CSV: données sensibles masquées ou chiffrées

### Fonctionnalités Métier Sécurisées
- [ ] Journal de bord: immuable (pas de suppression, que ajout)
- [ ] Alertes: pas de leak d'info entre utilisateurs
- [ ] Multi-caves: isolation données stricte
- [ ] Rate limiting sur imports (Vivino API)

---

## 🔍 NIVEAU 6: AUDITS & COMPLIANCE

### Logging de Sécurité
- [ ] Toutes les authentifications (success + failures)
- [ ] Accès aux données sensibles
- [ ] Modifications d'alertes/configurations
- [ ] Rate limits exceeds
- [ ] Tentatives de accès non autorisé

### Format Logs Sécurité
```json
{
  "timestamp": "2025-12-21T16:55:00Z",
  "event": "auth_failure",
  "user": "u***@example.com",
  "ip": "192.168.1.0/24",
  "reason": "invalid_password"
}
```

### Audits Réguliers
- [ ] Security review trimestriel
- [ ] Penetration testing annuel
- [ ] Code analysis statique (SAST)
- [ ] Dependency scanning (`govulncheck`)

---

## 🚨 NIVEAU 7: INCIDENT RESPONSE

### Plan de Réponse
- [ ] Runbook pour les breach
- [ ] Contacts de sécurité designés
- [ ] Procédure de notification utilisateurs
- [ ] Post-mortem blameless

### Récupération
- [ ] Restore depuis backup en < 1h
- [ ] Communiqué transparence préparé
- [ ] Changement credentials force après incident

---

## 📊 MATRICE DE VALIDATION

| Domaine | Dev | Staging | Prod |
|---------|-----|---------|------|
| **TLS** | Self-signed | Signed | Signed (auto-renewal) |
| **CORS** | `localhost:*` | `staging.glou.com` | Whitelist spécifique |
| **Auth** | Optional | Required | Required + MFA |
| **Rate Limit** | 1000 req/min | 200 req/min | 100 req/min |
| **Backup** | Manual | Daily | Hourly |
| **Monitoring** | Logs locaux | Centralized | Centralized + Alerts |

---

## ✅ CHECKLIST PRÉ-DÉPLOIEMENT PRODUCTION

### Avant Go-Live
- [ ] Toute LEVEL 1 validée
- [ ] HTTPS/TLS configuré et validé
- [ ] Backup automatique en place
- [ ] Monitoring + alerting actif
- [ ] Documentation sécurité mise à jour
- [ ] Équipe support formée aux incidents
- [ ] Log centralization en place
- [ ] GDPR compliance OK (if EU users)

### Jours 1-7 Après Deploy
- [ ] Monitoring 24/7 activé
- [ ] Security incidents response tested
- [ ] Users informed of security features
- [ ] Feedback collection active

---

## 🚫 ANTI-PATTERNS (NEVER DO THIS)

```go
// ❌ CRITIQUES
secret := os.Args[1]  // CLI args en logs
password := "hardcoded123"  // Hardcoded secrets
query := "SELECT * FROM users WHERE id = " + id  // SQL injection
fmt.Println(userData)  // Dump PII aux logs
user := os.Getenv("DB_USER")  // Hardcoded pour dev

// ❌ SÉRIEUX
defer recover()  // Silent panic swallowing
http.Client{}  // No timeout
sql.Open(...).Query(userInput)  // Unsanitized inputs
gzip.NewWriter(nil)  // Compression of sensitive data without encryption

// ❌ MOYENS
w.Header().Set("X-Frame-Options", "SAMEORIGIN")  // Too permissive
token = generateRandomString(8)  // Too short, weak entropy
session.Cookie.Secure = false  // In dev even (should test with true)
```

---

## ✨ BEST PRACTICES

```go
// ✅ Secrets
secret := os.Getenv("API_KEY")
if secret == "" {
    log.Fatal("API_KEY not set")
}

// ✅ Prepared Queries
rows, err := db.QueryContext(ctx, 
    "SELECT id, name FROM wines WHERE region = ?", region)

// ✅ Secure Headers
w.Header().Set("X-Frame-Options", "DENY")
w.Header().Set("X-Content-Type-Options", "nosniff")

// ✅ Timeouts
client := &http.Client{
    Timeout: 30 * time.Second,
}

// ✅ Logging
log.Printf("[SECURITY] Rate limit exceeded for IP: %s", sanitizeIP(ip))
// Never: log.Printf("User password: %s", password)
```

---

## 📚 Ressources

- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **CWE Top 25:** https://cwe.mitre.org/top25/
- **Go Security:** https://pkg.go.dev/golang.org/x/tools/go/analysis/passes/unsafeptr
- **GDPR Compliance:** https://gdpr-info.eu/

---

**Version:** 1.0  
**Status:** ✅ Production Ready  
**Last Audit:** 2025-12-21  
**Next Audit:** 2026-03-21
