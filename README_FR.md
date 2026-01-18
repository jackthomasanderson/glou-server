# Glou — Simplement Précieux

### Votre concierge privé pour bouteilles, bulles, spiritueux et cigares : tout est rangé, suivi et sous votre contrôle.

![Écran de connexion Glou](assets/login_page.png)

---

## ✨ Pourquoi Glou ? (Points Forts)

- 🍷 **Cave Infini & Historique** (FEAT-55) : Gérez des milliers de bouteilles avec un historique persistant. Tout est stocké en sécurité dans PostgreSQL.
- 🚀 **Suggestions Intelligentes** (FEAT-08) : Trop de choix ? Laissez Glou vous suggérer la bouteille parfaite selon l'apogée et vos goûts.
- 📱 **Mobile & Hors-Ligne** (FEAT-58) : Conçu pour tous les écrans. Gérez votre cave depuis le restaurant ou le fond de votre sous-sol.
- 🔐 **Sécurisé & Privé** (FEAT-02/03) : Auto-hébergé, support 2FA et propriété totale des données. Pas de suivi, pas de pubs.
- 📊 **Vues Dynamiques** (FEAT-57) : Visualisez votre collection à votre façon — basculez entre grille et liste instantanément.

---

## 🛠 Démarrage Express

### Prérequis
- Docker & Docker Compose

### Lancement
1. **Préparez la recette** — créez un `.env` à la racine :
```env
API_PORT=3001
WEB_PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=glou
DB_USER=glou
DB_PASSWORD=glou
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

2. **Lancez tout**
```bash
docker compose up -d db
cd api && npm install && npm run dev
cd ../web && npm install && npm run dev -- -p 3000
```

3. **Profitez** — ouvrez votre navigateur sur **[http://localhost:3000](http://localhost:3000)**

---

## 🗺 Roadmap (Feuille de route)

**En cours de préparation :**
- 📸 **Scan d'étiquette** (FEAT-04) : Une photo et la fiche bouteille est pré-remplie.
- 🛡 **Sessions de Confiance** (FEAT-25) : Gérez vos appareils actifs.
- 📓 **Journal de Dégustation** (FEAT-22) : Notez vos expériences sensorielles.
- 📧 **Réinitialisation de mot de passe** (FEAT-28) : Récupération de compte par email.
- ...et bien plus à venir !

---

**Fait avec soin pour les collectionneurs qui aiment garder leurs trésors simples et précieux.**
