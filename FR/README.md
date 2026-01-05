# Glou — Simplement Précieux

> Transformez votre passion pour les belles collections en expérience simple et élégante. Glou gère vos vins, champagnes, spiritueux et cigares avec intelligence et beauté.

## 🎯 C'est quoi, Glou ?

Glou est votre **sommelier personnel et conservateur numérique** pour les collections de luxe—vins, champagnes, spiritueux et cigares. Elle transforme la gestion fastidieuse des inventaires en une expérience élégante et intelligente.

Que vous soyez amateur passionné ou collectionneur averti, Glou vous aide à :
- **Ne jamais rater l'apogée** – Des alertes intelligentes vous préviennent quand boire, pour rien gaspiller
- **Connaître votre cave** – Un inventaire magnifique et visuel avec des insights instantanés
- **Décider ce qu'il faut boire** – Des suggestions intelligentes basées sur l'apogée, ce qui est ouvert et ce que vous aimeriez
- **Rester organisé** – Suivi simple et intuitif de toute votre collection, peu importe le nombre de caves

Glou est pensée pour l'usage maison et garde vos données privées—pas d'abonnement cloud infini, pas de surveillance.

---

## ✨ Fonctionnalités Principales

| Fonctionnalité | À Quoi Ça Sert |
|----------------|---|
| **📸 Scan & Ajout Express** | Photographiez une étiquette, Glou remplit les détails automatiquement. Pas de saisie manuelle. |
| **🔐 Accès Sécurisé** | Authentification à deux facteurs (2FA) et gestion des sessions pour protéger votre collection. |
| **👥 Profils Multi-Utilisateurs** | Rôles admin et invité, plus personnalisation complète (thème, langue, notifications). |
| **⏰ Alertes Apogée Intelligentes** | Ne ratez jamais une fenêtre. Notifications avant, pendant et après l'apogée idéale. |
| **🍷 Suivi des Bouteilles Ouvertes** | Marquez comme ouvert, suivez le niveau restant, et recevez des rappels avant dégradation. |

---

## 🚀 Démarrage Rapide

### Prérequis
- **Docker & Docker Compose** installés sur votre système
- Un fichier `.env` avec votre configuration (voir ci-dessous)

### Installation & Lancement

#### 1. Clonez le Dépôt
```bash
git clone <votre-url-repo>
cd glou-server
```

#### 2. Configurez Votre Fichier `.env`
Créez un fichier `.env` à la racine du projet avec les variables suivantes :

```env
# Base de Données
POSTGRES_DB=glou
POSTGRES_USER=glou_user
POSTGRES_PASSWORD=votre_mot_de_passe_securise
DATABASE_URL=postgresql://glou_user:votre_mot_de_passe_securise@db:5432/glou

# Serveur API
API_PORT=3001
NODE_ENV=development

# Frontend
WEB_PORT=3000

# Authentification
JWT_SECRET=votre_clé_secrète_jwt
JWT_EXPIRY=7d

# Optionnel : Pour OCR/Vision ou enrichissement API
VIVINO_API_KEY=votre_clé_optionnelle
```

#### 3. Lancez avec Docker Compose
```bash
docker-compose up -d
```

L'application tourne maintenant :
- **Interface Web** : http://localhost:3000
- **API** : http://localhost:3001

#### 4. Première Connexion
- Créez votre compte administrateur sur la page d'enregistrement
- Activez la 2FA pour la sécurité
- Commencez à ajouter votre collection !

---

## 📚 Utiliser Glou

### Ajouter Votre Première Bouteille
1. Allez à **Tableau de Bord** → **Ajouter Bouteille**
2. Choisissez entre :
   - **Scanner une étiquette** (FEAT-04) : Photographiez l'étiquette pour la reconnaissance instantanée
   - **Saisie manuelle** : Remplissez les détails de votre bouteille
3. Sélectionnez la catégorie (Vin, Champagne, Spiritueux, Cigare) pour les champs pertinents
4. Enregistrez — elle apparaît immédiatement dans votre inventaire (Optimistic UI)

### Gérez Votre Collection
- **Voir toutes les bouteilles** : Affichez votre collection entière avec filtrage et tri
- **Modifier les détails** : Mettez à jour les informations quand vous voulez
- **Suivre les bouteilles ouvertes** : Marquez comme ouvert et fixez le niveau restant pour la planification

### Configurez les Alertes Intelligentes
- **Alertes apogée** (FEAT-06) : Notifiez avant l'apogée optimal
- **Rappels bouteille ouverte** (FEAT-07) : Savez quand boire ou reboucher
- **Personnalisez par collection** : Adaptez la fréquence et les canaux (in-app, email)

### Planifiez Votre Consommation
- **Suggestions de dégustation** (FEAT-08) : Liste IA de ce qu'il faut boire maintenant selon l'apogée et l'ouverture
- **Fixez des objectifs** : Ciblez un nombre de bouteilles par mois
- **Plan hebdomadaire** : Suggestions auto-générées que vous pouvez adapter

---

## 🛠️ Développement

### Lancer Localement (Sans Docker)

#### Prérequis
- Node.js 18+ et npm
- PostgreSQL en local

#### Backend
```bash
cd api
npm install
npm run dev
```
Le serveur tourne sur http://localhost:3001

#### Frontend
```bash
cd web
npm install
npm run dev -- -p 3000
```
L'interface tourne sur http://localhost:3000

### Build pour la Production
```bash
docker-compose -f docker-compose.yml build
```

---

## 🗺️ Roadmap

À Venir sur Glou :

| Fonctionnalité | C'est Quoi |
|---|---|
| **Scan & OCR** (FEAT-04) | Reconnaissance automatique d'étiquette pour lookup instantanée |
| **Apogée Intelligente** (FEAT-06) | Fenêtres prédictives pour les dates optimales de dégustation |
| **Suivi Bouteille Ouverte** (FEAT-07) | Suivi précis des bouteilles ouvertes et rappels de consommation |
| **Plan de Consommation** (FEAT-08) | Suggestions intelligentes de ce qu'il faut boire et quand |
| **Import & Ajout en Masse** (FEAT-09) | Téléchargez Excel/CSV pour remplir rapidement votre cave |

---

## 🔐 Sécurité & Vie Privée

- **Vos données, votre serveur** : Glou tourne sur votre propre matériel. Pas de suivi, pas de blocage cloud.
- **Authentification à deux facteurs** : Protégez votre collection avec 2FA (TOTP ou WebAuthn)
- **Exécution sans root** : Le conteneur tourne avec des permissions réduites (PUID/PGID)
- **Config basée sur l'environnement** : Tous les secrets et ports stockés dans `.env`, jamais en dur

---

## 🌍 Internationalisation

Glou supporte :
- **Anglais (EN)** – Interface complète et notifications
- **Français (FR)** – Interface complète et notifications

Réglez votre langue dans **Profil → Préférences** ou votre configuration `.env`.

---

## 📖 Documentation

- **[Spécifications des Fonctionnalités](./.vibe/features)** : Docs détaillés pour chaque feature
- **[Vision & Design](./.vibe/vision.md)** : Philosophie du projet et roadmap

---

## 💬 Support & Retours

C'est un projet passionnel pour l'usage maison. Si vous trouvez des bugs ou avez des idées :
1. Consultez la [Roadmap](#-roadmap) ci-dessus
2. Revoyez les [features en développement](./.vibe/features/wip/)
3. Ouvrez une issue avec les détails et des captures d'écran

---

## 📄 Licence

MIT License — Glou est fait avec ❤️ pour ceux qui respectent leurs collections.

---

**Simplement précieux. Intelligemment géré.**
