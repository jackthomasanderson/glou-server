# Glou — Simplement Précieux

Votre concierge privé pour bouteilles, bulles, spiritueux et cigares : tout est rangé, suivi et sous votre contrôle.

---

 ## ✨ Ce qu’il fait pour vous

 - 🍷 **Ajout et rangement express** (FEAT-01) : Créez, modifiez, mettez à la corbeille ou restaurez une bouteille avec des champs malins selon la catégorie, sauvegardes optimistes et un petit délai pour annuler.
 - 💾 **Votre collection, toujours là** (FEAT-55) : Chaque bouteille persiste dans PostgreSQL—fermez l'app, redémarrez le serveur, tout reste exactement là où vous l'avez laissé.
 - 🎛 **Profil et préférences** (FEAT-03) : Langue, thème et accents sauvegardés pour chaque session.
 - 🔐 **2FA TOTP** (FEAT-02) : Connexions sécurisées avec codes et clés de secours.
 - 🏠 **Gestion des celliers (Caves)** (FEAT-24) : Créez et gérez vos celliers avant d'ajouter des bouteilles; schéma et API relationnels inclus.
 - 👀 **Vue à votre image** (FEAT-57) : Basculez entre grille et liste pour explorer votre collection selon votre style.

---

## 🛠 Démarrage Express

1) **Préparez la recette** — créez un `.env` à la racine :
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

2) **Lancez l’essentiel**
```bash
docker compose up -d db
cd api && npm install && npm run dev
cd ../web && npm install && npm run dev -- -p 3000
```

3) **Profitez** — ouvrez votre navigateur sur http://localhost:3000

Envie d’une seule commande ?
```bash
docker run -d --env-file .env -p 3000:3000 -p 3001:3001 glou:latest
```

---

## 🗺 Sur l’horizon

- 📸 **Scan d’étiquette** (FEAT-04) : Une photo et la fiche bouteille est déjà préremplie.
- 🪶 **Transparence des sources** (FEAT-05) : Voir l’origine de chaque donnée et garder vos overrides en priorité.
- ⏰ **Alertes d’apogée** (FEAT-06) : Rappels doux avant, pendant et après chaque fenêtre idéale.

---

Fait avec soin pour les collectionneurs qui aiment garder leurs trésors simples et précieux.
