# ❓ FAQ - Frequently Asked Questions

**English** | [Français](#faq---questions-fréquemment-posées)

## Setup & Installation

### Q: How do I run Glou?
A: Two options:
```bash
# Option 1: Direct
go build -o api ./cmd/api
./api

# Option 2: Docker
docker-compose up -d
```
Then open: http://localhost:8080/

### Q: What are system requirements?
A: 
- Go 1.24+ (for development)
- Docker (for deployment)
- 512 MB RAM minimum
- 1 GB disk space (including database)

### Q: Can I run it on Windows/Mac/Linux?
A: Yes! Glou works on all platforms. Docker image is also available.

### Q: How do I change the language?
A: Click the language toggle in the top-right corner (English/Français). Language preference is saved in your browser.

---

## Features & Usage

### Q: What's an "apogee date"?
A: The period when a wine is at its best for drinking. Glou tracks:
- **Min apogee:** When the wine is ready to drink
- **Max apogee:** When it's past its peak

"À Boire Maintenant" shows wines in their apogee window.

### Q: Can I track multiple cellars?
A: Yes! Create multiple caves (cellars), each with cells (shelves/locations). Organize your wines across different storage areas.

### Q: How do I record wine consumption?
A: Go to **Journal** tab and click "Enregistrer une consommation" (Record Consumption). Select:
- Wine to record
- Reason (Tasting/Sale/Gift/Loss)
- Date & rating
- Tasting notes

### Q: Do alerts work automatically?
A: Yes! Alerts are generated automatically when:
- Wine is 6 months from max apogee
- Wine has passed max apogee
- Cellar capacity reaches 90%+

---

## Data & Storage

### Q: Where is my data stored?
A: In a local SQLite database (`glou.db`) in the application directory. Your data stays on your server, no cloud sync.

### Q: How do I backup my data?
A: The database file `glou.db` is your backup. Copy it to a safe location. See `DEPLOYMENT_GUIDE.md` for automated backup procedures.

### Q: Can I export my wines?
A: Currently wines can be exported via the API. See `API_REFERENCE.md` for export endpoints.

### Q: Is my data encrypted?
A: Database is not encrypted by default. For encryption, use OS-level encryption (BitLocker/FileVault) or database encryption.

---

## API & Integration

### Q: Can I use the API programmatically?
A: Yes! 25+ REST endpoints available. See `API_REFERENCE.md` for complete documentation with curl examples.

### Q: What's the rate limit?
A: 100 requests/minute per IP address (configurable). See `DEPLOYMENT_GUIDE.md`.

### Q: Can I integrate with other apps?
A: Yes! The REST API is open. Create webhooks, scripts, or integrations as needed.

---

## Security & Privacy

### Q: Is Glou secure?
A: Yes! Features include:
- CORS validation (strict origin checking)
- Rate limiting (prevent abuse)
- Security headers (X-Frame-Options, CSP, etc.)
- Input validation & SQL injection protection
- HTTPS ready with Let's Encrypt support

See `SECURITY_CHECKLIST.md` for full details.

### Q: Who has access to my data?
A: Only you (single-user). Multi-user support is planned for Phase 2 with JWT authentication.

### Q: Do you track my data?
A: No tracking. Glou is self-hosted, your data never leaves your server.

---

## Performance & Troubleshooting

### Q: The app is slow. What can I do?
A: 
1. Check if you have 1000+ wines (rebuild database index)
2. Clear browser cache
3. Check available RAM
4. Monitor network latency

### Q: I'm getting errors. How do I debug?
A: Check server logs:
```bash
# If running directly
# Look at console output

# If using Docker
docker logs glou-server
```

### Q: Can I run multiple instances?
A: Currently no. Phase 2 will add multi-user support with PostgreSQL.

### Q: Database is getting large. Can I clean it?
A: SQLite files can grow. Use `VACUUM` to optimize:
```bash
sqlite3 glou.db "VACUUM;"
```

---

## Deployment

### Q: How do I deploy to production?
A: See `DEPLOYMENT_GUIDE.md` for complete 5-phase deployment procedure.

### Q: Can I use a different database?
A: Currently SQLite only. PostgreSQL support is planned for Phase 2.

### Q: How do I secure my production instance?
A: 
1. Use HTTPS (Let's Encrypt with Nginx)
2. Set strong CORS origins
3. Configure rate limiting
4. Regular backups
5. Monitor logs

See `SECURITY_CHECKLIST.md` for full checklist.

### Q: Can I run behind a proxy/reverse proxy?
A: Yes! Nginx configuration included in `DEPLOYMENT_GUIDE.md`.

---

## Development

### Q: How do I contribute?
A: 
1. Read `.docs/BEST_PRACTICES.md`
2. Follow `COMMIT_CHECKLIST.md`
3. Ensure 70%+ test coverage
4. Submit changes

### Q: How do I run tests?
A: 
```bash
go test -v ./...           # All tests
go test -cover ./...       # With coverage
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

### Q: Are there any known bugs?
A: See GitHub Issues for open issues. Currently no critical bugs known.

---

## Roadmap

### Q: What's coming next?
A: **Phase 2 (Q2 2025):**
- JWT authentication
- Multi-user support
- PostgreSQL option

**Phase 3 (Q3 2025):**
- Vivino API integration
- PDF export
- Email alerts

**Phase 4 (Q4 2025):**
- iOS app
- Android app
- Advanced analytics

See `PROJECT_COMPLETION_REPORT.md` for full roadmap.

---

## Support

### Q: I still have questions
A: 
1. Check `.docs/` for complete documentation
2. Review code comments
3. Check API reference
4. Open an issue on GitHub

---

# FAQ - Questions Fréquemment Posées

## Installation & Configuration

### Q: Comment lancer Glou?
A: Deux options:
```bash
# Option 1: Direct
go build -o api ./cmd/api
./api

# Option 2: Docker
docker-compose up -d
```
Puis ouvrir: http://localhost:8080/

### Q: Quelles sont les prérequis?
A:
- Go 1.24+ (pour développement)
- Docker (pour déploiement)
- 512 MB RAM minimum
- 1 GB d'espace disque

### Q: Peut-on changer la langue?
A: Oui! Cliquez sur le bouton de langue en haut à droite (English/Français). La langue est sauvegardée dans votre navigateur.

---

## Fonctionnalités & Usage

### Q: C'est quoi une "date d'apogée"?
A: La période où le vin est à son meilleur pour la dégustation. Glou suit:
- **Apogée min:** Quand le vin est prêt à boire
- **Apogée max:** Quand il dépasse son pic

"À Boire Maintenant" affiche les vins en période d'apogée.

### Q: Puis-je gérer plusieurs caves?
A: Oui! Créez plusieurs caves, chacune avec des cellules (étagères). Organisez vos vins dans différents espaces de stockage.

### Q: Comment enregistrer une consommation?
A: Allez à l'onglet **Journal** et cliquez "Enregistrer une consommation". Sélectionnez:
- Le vin
- La raison (Dégustation/Vente/Cadeau/Perte)
- La date & note
- Notes de dégustation

### Q: Les alertes fonctionnent-elles automatiquement?
A: Oui! Les alertes sont générées quand:
- Le vin est à 6 mois de l'apogée max
- L'apogée max est dépassée
- La capacité de la cave atteint 90%+

---

## Données & Stockage

### Q: Où sont stockées mes données?
A: Dans une base de données SQLite locale (`glou.db`). Vos données restent sur votre serveur, pas de synchronisation cloud.

### Q: Comment faire une sauvegarde?
A: Le fichier `glou.db` est votre sauvegarde. Copiez-le dans un endroit sûr. Voir `DEPLOYMENT_GUIDE.md` pour les procédures de sauvegarde automatique.

### Q: Puis-je exporter mes vins?
A: Actuellement via l'API. Voir `API_REFERENCE.md` pour les endpoints d'export.

### Q: Les données sont-elles chiffrées?
A: Non par défaut. Pour le chiffrement, utilisez le chiffrement OS (BitLocker/FileVault).

---

## API & Intégration

### Q: Puis-je utiliser l'API programmatiquement?
A: Oui! 25+ endpoints REST disponibles. Voir `API_REFERENCE.md`.

### Q: Quel est le taux limite?
A: 100 requêtes/minute par IP (configurable). Voir `DEPLOYMENT_GUIDE.md`.

### Q: Puis-je intégrer avec d'autres apps?
A: Oui! L'API REST est ouverte.

---

## Sécurité & Confidentialité

### Q: Glou est-il sécurisé?
A: Oui! Incluant:
- Validation CORS stricte
- Rate limiting
- Headers de sécurité
- Protection contre les injections SQL
- Support HTTPS/Let's Encrypt

Voir `SECURITY_CHECKLIST.md`.

### Q: Qui a accès à mes données?
A: Vous seul (mono-utilisateur). Le multi-utilisateur est prévu en Phase 2.

### Q: Tracez-vous mes données?
A: Non. Glou est auto-hébergé, vos données ne quittent jamais votre serveur.

---

## Performance & Dépannage

### Q: L'app est lente. Que faire?
A:
1. Vérifiez si vous avez 1000+ vins
2. Nettoyez le cache navigateur
3. Vérifiez la RAM disponible
4. Contrôlez la latence réseau

### Q: J'obtiens des erreurs. Comment déboguer?
A: Vérifiez les logs serveur.

### Q: Puis-je exécuter plusieurs instances?
A: Actuellement non. Phase 2 ajoutera le support multi-utilisateur.

---

## Déploiement

### Q: Comment déployer en production?
A: Voir `DEPLOYMENT_GUIDE.md` pour la procédure complète.

### Q: Puis-je utiliser une autre base de données?
A: Actuellement SQLite seulement. PostgreSQL est prévu pour Phase 2.

### Q: Comment sécuriser mon instance de production?
A:
1. Utilisez HTTPS (Let's Encrypt avec Nginx)
2. Configurez des CORS stricts
3. Paramétrez le rate limiting
4. Sauvegardes régulières
5. Monitorez les logs

Voir `SECURITY_CHECKLIST.md`.

---

## Développement

### Q: Comment contribuer?
A:
1. Lisez `.docs/BEST_PRACTICES.md`
2. Suivez `COMMIT_CHECKLIST.md`
3. Assurez 70%+ de couverture de tests
4. Soumettez vos changements

### Q: Comment exécuter les tests?
A:
```bash
go test -v ./...           # Tous les tests
go test -cover ./...       # Avec couverture
```

---

## Feuille de Route

### Q: C'est quoi la suite?
A: Voir `PROJECT_COMPLETION_REPORT.md` pour la feuille de route complète.
