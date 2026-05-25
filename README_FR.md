<div align="center">
  <h1>🍷 Glou</h1>
  <p><strong>Simplement précieux.</strong></p>
  <p>Glou est un gestionnaire d'actifs auto-hébergé pour collections de luxe — vins, spiritueux, bulles et cigares. Reconnaissance visuelle, données d'experts et indicateurs d'apogée dans une stack que vous maîtrisez entièrement.</p>
</div>

---

## ✨ Le Top 5
1. 📸 **Saisie Zéro Effort** : Photographiez une étiquette. L'OCR remplit les détails instantanément.
2. 🤝 **Inventaire Partagé** : Tous les utilisateurs de l'instance partagent une cave commune — parfait pour les familles, colocataires et clubs.
3. 🧠 **Smart Data Engine** : Enrichissement automatique via Vivino et Whiskybase, avec cache local.
4. 🔔 **Alertes Apogée** : Soyez notifié quand une bouteille entre dans sa fenêtre de dégustation optimale.
5. 🛡️ **Totalement Auto-Hébergé** : Une stack Docker Compose (Node.js · Next.js · PostgreSQL) que vous faites tourner chez vous.

---

## 🚀 L'Autoroute (Quick Start)

**Prérequis :**
- Docker installé et en cours d'exécution.

**Étape 1 — Configurer**
```bash
cp .env.example .env
```
Ouvrez `.env` et renseignez un `JWT_SECRET` robuste.

> [!CAUTION]
> `JWT_SECRET` n'a pas de valeur par défaut sûre. Utiliser la valeur d'exemple rend toutes les sessions utilisateurs falsifiables. Générez-en une avec : `openssl rand -hex 32`

**Étape 2 — Lancer**
```bash
docker compose up -d
```
Docker télécharge les images pré-construites et démarre la stack. Aucune compilation requise.

**Étape 3 — Créer votre compte**

Rendez-vous sur [http://localhost:3000](http://localhost:3000) et cliquez sur **S'inscrire**. Le premier compte créé reçoit automatiquement les droits administrateur.

> [!TIP]
> Pour mettre à jour vers une nouvelle version : `docker compose pull && docker compose up -d`

*Pour la configuration avancée, les variables d'environnement et le dépannage, consultez le [Wiki](./docs/wiki/FR/_wiki.md).*

---

## 🗺️ Roadmap & Prochaines Étapes

### 🏗️ En Cours (WIP)
- 🗺️ **Plan Visuel de Cave (FEAT-68)** : Vue en grille des emplacements de cave, colorée par catégorie de produit.
- 🔒 **Double Authentification (FEAT-02)** : 2FA basée sur TOTP pour protéger votre compte.
- ⚡ **Scan Express (FEAT-04)** : Mode session pour scanner des dizaines de bouteilles d'affilée.

### ✅ Récemment Ajouté
- ✨ **Autocomplétion & Recherche d'Image (FEAT-66)** : Suggestions Google pour le nom et le producteur à la saisie — millésime extrait automatiquement. Association d'une photo via Wikimedia Commons.
- 🔍 **Recherche Globale (FEAT-64)** : Barre de recherche dans la navbar pour trouver instantanément n'importe quelle bouteille par nom, producteur, millésime ou catégorie.
- 🔗 **Détection de Doublons (FEAT-65)** : Avertissement automatique avant l'enregistrement si une bouteille identique existe déjà dans la cave.
- 📡 **Indicateur de Connectivité (FEAT-67)** : Statut internet en temps réel dans la navbar — les fonctions externes (autocomplétion, images) se dégradent gracieusement hors ligne.
- 👥 **Rôles & Contrôle d'Accès (FEAT-61)** : Les admins peuvent activer/désactiver les comptes avec effet immédiat (invalidation JWT en live) et consulter un journal d'audit paginé.
- 🔔 **Alertes Apogée (FEAT-06)** : Alertes automatiques quand une bouteille entre dans sa fenêtre de dégustation optimale.
- 🎨 **Profils & Personnalisation (FEAT-03)** : Thème, couleur d'accent, langue (FR/EN) et format de date — appliqués instantanément.
- 🏷️ **Gestion Contextuelle (FEAT-01)** : Création et édition adaptées au type d'actif (vins, bulles, spiritueux, cigares).
- 🔍 **Recherche Avancée & Filtres (FEAT-48)** : Retrouvez n'importe quelle bouteille par nom, producteur, millésime, catégorie ou cave en temps réel.
- 📦 **Actions Groupées & Modèles (FEAT-11)** : Mettez à jour votre cave en masse et sauvegardez des modèles pour automatiser vos routines.

### 🔮 À Venir
- Analyses prédictives pour la valorisation de la collection.
- Intégration IoT avancée pour le suivi en direct de la température et de l'hygrométrie.
- Application mobile native.
