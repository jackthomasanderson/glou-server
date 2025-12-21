# ✅ Checklist de Sécurité ANSSI - Glou Server

## 📋 Avant le Déploiement Production

### 1. Configuration du Chiffrement

- [ ] Généré une passphrase de chiffrement ≥ 32 caractères
  ```bash
  openssl rand -base64 48
  ```
  
- [ ] Configuré `ENCRYPTION_PASSPHRASE` dans les variables d'environnement
  
- [ ] Configuré `ENCRYPTION_SALT` unique pour cette installation
  ```bash
  openssl rand -hex 16
  ```
  
- [ ] Défini `ENVIRONMENT=production`

- [ ] Vérifié au démarrage : "Encryption service initialized (ANSSI AES-256-GCM)"

### 2. Protection des Fichiers

- [ ] Permissions du fichier `.env` : `chmod 600 .env`
  
- [ ] Permissions de la base de données : `chmod 600 glou.db`
  
- [ ] Permissions du binaire : `chmod 750 api`
  
- [ ] Fichier `.env` ajouté au `.gitignore`
  
- [ ] Aucun secret committé dans Git

### 3. HTTPS et Réseau

- [ ] HTTPS activé via reverse proxy (nginx, caddy, etc.)
  
- [ ] Certificat SSL valide configuré
  
- [ ] `PUBLIC_PROTOCOL=https` configuré
  
- [ ] `PUBLIC_DOMAIN` configuré avec le vrai domaine
  
- [ ] CORS limité aux domaines autorisés (pas de wildcard `*`)

### 4. Firewall et Accès

- [ ] Firewall activé (ufw, firewalld, etc.)
  
- [ ] Ports minimaux ouverts (uniquement 80/443 si reverse proxy)
  
- [ ] Port 8080 accessible uniquement en local si reverse proxy
  
- [ ] SSH sécurisé (clés uniquement, pas de mot de passe)

### 5. Utilisateur et Isolation

- [ ] Serveur exécuté sous utilisateur dédié (pas root)
  ```bash
  useradd -r -s /bin/false glou-server
  ```
  
- [ ] Fichiers appartiennent à l'utilisateur dédié
  ```bash
  chown -R glou-server:glou-server /var/lib/glou-server
  ```
  
- [ ] Service systemd configuré avec `User=glou-server`

### 6. Mots de Passe et Credentials

- [ ] Mot de passe admin initial fort (≥ 12 caractères, complexe)
  
- [ ] Mots de passe SMTP stockés via le système de chiffrement
  
- [ ] Tokens API stockés via le système de chiffrement
  
- [ ] Aucun mot de passe en clair dans la configuration

### 7. Rate Limiting et Protection

- [ ] Rate limiting configuré (défaut : 100 req/min)
  
- [ ] `RATE_LIMIT_REQUESTS` ajusté selon les besoins
  
- [ ] Timeout des requêtes configuré (défaut : 30s)
  
- [ ] Taille maximale des requêtes limitée

### 8. Logs et Audit

- [ ] Niveau de log approprié (`LOG_LEVEL=info` en production)
  
- [ ] Rotation des logs configurée (logrotate)
  
- [ ] Activity log activé et surveillé
  
- [ ] Logs sensibles ne contiennent pas de secrets

### 9. Sauvegarde

- [ ] Stratégie de backup définie (quotidien recommandé)
  
- [ ] Backups chiffrés avec GPG ou similaire
  
- [ ] Backups testés (restauration vérifiée)
  
- [ ] Backups stockés hors site

### 10. Monitoring

- [ ] Monitoring des erreurs configuré
  
- [ ] Alertes sur tentatives de connexion échouées
  
- [ ] Alertes sur erreurs de chiffrement/déchiffrement
  
- [ ] Surveillance de l'utilisation CPU/RAM/Disque

---

## 🔄 Après le Déploiement

### Validation Immédiate

- [ ] Serveur démarre sans erreur
  
- [ ] Chiffrement initialisé (log confirmé)
  
- [ ] Interface web accessible via HTTPS
  
- [ ] Connexion admin fonctionne
  
- [ ] Ajout/modification de données fonctionne

### Tests de Sécurité

- [ ] Scan de vulnérabilités effectué (nmap, nikto, etc.)
  
- [ ] Test d'injection SQL (toutes requêtes paramétrées)
  
- [ ] Test XSS (validation stricte des entrées)
  
- [ ] Test CSRF (vérification des origines)
  
- [ ] Test rate limiting (dépassement bloqué)

### Documentation

- [ ] Configuration documentée (mots de passe exclus)
  
- [ ] Procédure de récupération définie
  
- [ ] Contacts d'urgence définis
  
- [ ] Plan de réponse aux incidents créé

---

## 🔒 Maintenance Continue

### Hebdomadaire

- [ ] Vérifier les logs d'erreur
- [ ] Vérifier les tentatives de connexion échouées
- [ ] Vérifier l'espace disque

### Mensuel

- [ ] Vérifier les mises à jour de sécurité Go
- [ ] Vérifier les CVE des dépendances
- [ ] Tester la restauration depuis backup
- [ ] Audit des utilisateurs actifs

### Semestriel

- [ ] Rotation de la passphrase de chiffrement
  ```bash
  # Générer nouvelle passphrase
  openssl rand -base64 48
  
  # Backup avant rotation
  cp glou.db glou-backup-$(date +%Y%m%d).db
  
  # Mettre à jour et redémarrer
  ```
  
- [ ] Audit de sécurité complet
- [ ] Revue des permissions et accès
- [ ] Mise à jour de la documentation

### Annuel

- [ ] Revue complète de la sécurité ANSSI
- [ ] Test de récupération après incident
- [ ] Formation/rappel sécurité équipe
- [ ] Audit externe (recommandé)

---

## 🚨 Réponse aux Incidents

### En cas de Compromission Suspectée

1. **Isoler immédiatement**
   ```bash
   systemctl stop glou-server
   ```

2. **Préserver les preuves**
   ```bash
   cp -r /var/log/glou-server /var/log/glou-incident-$(date +%Y%m%d)
   cp glou.db glou-incident-$(date +%Y%m%d).db
   ```

3. **Analyser**
   - Examiner les logs d'activité
   - Vérifier les connexions suspectes
   - Identifier le vecteur d'attaque

4. **Corriger**
   - Patcher la vulnérabilité
   - Changer tous les mots de passe
   - Régénérer les clés de chiffrement
   - Restaurer depuis backup propre si nécessaire

5. **Documenter**
   - Rapport d'incident complet
   - Actions prises
   - Leçons apprises

6. **Notifier**
   - CERT-FR si nécessaire
   - Utilisateurs concernés (RGPD)

---

## 📞 Contacts Sécurité

### Ressources ANSSI

- **CERT-FR** : https://www.cert.ssi.gouv.fr/
- **Cybermalveillance** : https://www.cybermalveillance.gouv.fr/
- **ANSSI** : https://www.ssi.gouv.fr/

### Documentation Projet

- [SECURITE_ANSSI.md](SECURITE_ANSSI.md) - Guide complet
- [CHIFFREMENT.md](CHIFFREMENT.md) - Guide technique
- [SECURITE_MISE_A_JOUR.md](SECURITE_MISE_A_JOUR.md) - Changelog

---

## ✅ Certification de Conformité

Une fois tous les points validés :

```
Date de certification : _______________
Validé par : _______________
Environnement : Production
Version Glou : 1.0+
Conformité ANSSI : ✅
```

**Signature :** _______________

---

**Dernière mise à jour :** 21 décembre 2024  
**Version checklist :** 1.0  
**Conforme à :** Recommandations ANSSI 2024
