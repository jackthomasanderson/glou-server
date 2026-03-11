<div align="center">
  <h1>🍷 Glou</h1>
  <p><strong>Simplement précieux.</strong></p>
  <p>Glou est un écosystème de gestion intelligente et haute fidélité pour vos actifs de luxe (vins, bulles, spiritueux, cigares). En combinant reconnaissance visuelle, données d'experts et indicateurs prédictifs, nous aidons les collectionneurs à préserver l'intégrité de leurs actifs et à maîtriser leur apogée.</p>
</div>

---

## ✨ Le Top 5
1. 📸 **Saisie Zéro Effort (Système Hybride)** : Prenez une photo de l'étiquette ! Notre système OCR/vision remplit instantanément les détails.
2. 🤝 **Inventaire Partagé** : Conçu pour la collaboration. Tous les utilisateurs de l'instance partagent un inventaire commun unique (parfait pour les familles ou clubs).
3. 🧠 **Smart Data Engine** : Enrichissement automatique via APIs (Vivino, Whiskybase) intégré à notre cache local propriétaire.
4. 💎 **UX Immersive Haute Fidélité** : Un design system élégant offrant des performances instantanées.
5. 🛡️ **Sécurité et Évolutivité** : Une stack Docker Compose robuste (Node.js, Next.js, PostgreSQL).

---

## 🚀 L'Autoroute (Quick Start)
Démarrez votre propre instance de Glou en moins de 2 minutes.

**Prérequis :**
- Docker et Docker Compose installés.

**Commandes :**
```bash
# 1. Copier le fichier d'environnement d'exemple
cp .env.example .env

# 2. Lancer la stack complète en arrière-plan
docker-compose up -d
```

**Accès :**
Une fois les conteneurs démarrés, rendez-vous simplement sur [http://localhost:3000](http://localhost:3000) pour accéder à l'interface web. L'API tourne silencieusement sur le port 3001.

*Note : Pour les configurations avancées et la résolution de problèmes, consultez notre [Wiki](./docs/wiki/FR/_wiki.md).*

---

## 🗺️ Roadmap & Prochaines Étapes
Glou évolue constamment. Voici un aperçu de ce qui se prépare en cuisine.

### 🏗️ En Cours (WIP)
- 🔒 **Sécurité Renforcée (FEAT-02)** : Arrivée de la double authentification (2FA) pour protéger votre compte.
- 🎨 **Profils & Personnalisation (FEAT-03)** : Contrôle total sur votre thème (clair/sombre), vos couleurs d'accentuation, et vos unités (FR/EN) appliqués instantanément.
- ⚡ **Scan Express (FEAT-04)** : Amélioration du flux OCR pour un "mode session" permettant de scanner des dizaines d'articles à la volée.

### ✅ Récemment Ajouté
- 🏷️ **Gestion Contextuelle (FEAT-01)** : Ajout et édition "intelligents", s'adaptant parfaitement au type d'actif (vins, bulles, spiritueux, cigares).

### 🔮 À Venir
- Analyses prédictives pour la valorisation de la cave.
- Intégration IoT avancée pour le suivi en direct de l'hygrométrie et de la température.
- Application mobile native d'accompagnement.
