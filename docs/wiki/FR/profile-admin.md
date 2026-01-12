# Profil, préférences et admin

## TL;DR
Tout se règle dans `/profile` : identité, langue, thème, couleur d'accent, notifications. Le bloc admin n'apparaît que pour les comptes avec rôle `admin`.
La marque (nom, slogan, logo) est globale et stockée dans la table `app_settings`.

## Prérequis
- Être connecté avec un compte valide; rôle `admin` requis pour la section Administration.
- Backend joignable (les mutations passent par l'API `/api/profile/*` et `/api/admin/*`).
- URLs webhook/Gotify accessibles depuis le serveur si vous testez les notifications.

## Action
1. Ouvrez `/profile` depuis le menu utilisateur.
2. Identité : modifiez nom affiché, URL d'avatar et slogan; les champs vides sont autorisés.
3. Préférences : choisissez la langue (FR/EN), le thème (clair/sombre) et la couleur d'accent au format hex `#RRGGBB`.
4. Notifications : renseignez les URLs webhook/Gotify, cochez les canaux et catégories, puis envoyez un test pour vérifier l'accessibilité.
5. Cliquez sur Enregistrer pour persister les changements; l'UI applique un optimistic update puis recharge les données.
6. Section Admin (si visible) : mettez à jour nom/slogan/logo de l'app, et changez les rôles des utilisateurs existants via le sélecteur (admin/user).

## Pourquoi ça ne marche pas ?




### Vue d'ensemble
Chaque utilisateur gère son identité, ses préférences (langue, thème, couleur d'accent) et ses notifications. Les admins peuvent aussi gérer la marque globale et les rôles utilisateurs.

### Principaux endpoints
- `GET /api/profile/me` — Récupère le profil et les préférences de l'utilisateur courant
- `PATCH /api/profile/me` — Met à jour le profil et les préférences de l'utilisateur courant
- `POST /api/profile/notifications/test` — Teste les canaux de notification (webhook, Gotify)
- `GET /api/profile/app-settings` — Public : récupère la marque (nom, slogan, logo)
- `GET /api/admin/users` — Liste tous les utilisateurs (admin uniquement)
- `PATCH /api/admin/users/:userId/role` — Change le rôle d'un utilisateur (admin uniquement)
- `GET /api/admin/app-settings` — Récupère la marque globale (admin uniquement)
- `PATCH /api/admin/app-settings` — Met à jour la marque globale (admin uniquement)

### Migrations

- `db/init/03-feat-03-profiles-roles.sql` — ajoute les colonnes de profil et `accent_color` aux utilisateurs.
- `db/init/07-migrate-accent-color.sql` — (migration) met à jour les accents dorés hérités vers la valeur par défaut actuelle `#2563EB`.

### Intégration Frontend/Backend
- **Frontend** : Utilise React Query pour le fetch et les mutations optimistes des données profil/admin. La page profil (`/profile`) permet d'éditer identité, préférences et notifications. Les admins voient des contrôles supplémentaires pour la marque et la gestion des utilisateurs.
- **Backend** : Routes Express avec validation (Zod), authentification/autorisation, et persistance PostgreSQL. Les tests de notification font un POST vers les URLs fournies et retournent le statut HTTP.
- **Optimistic UI** : Les mutations mettent à jour l'UI instantanément; les erreurs déclenchent un rollback et un fallback visuel.
- **Internationalisation** : Toutes les chaînes sont traduites (EN/FR) via un provider central.

### Modèle de données (Profil)
- `displayName`, `avatarUrl`, `tagline` : Identité utilisateur
- `preferredLocale`, `themeMode`, `accentColor` : Préférences
- `notificationSettings` : Canaux, catégories, plages silencieuses, URLs webhook/Gotify

### Gestion des erreurs
- Tous les endpoints retournent des erreurs structurées; les problèmes de validation sont détaillés pour le frontend.
- Le test de notification retourne le statut HTTP distant et l'erreur si inaccessible.

### Sécurité
- Toutes les mutations nécessitent une authentification; les endpoints admin exigent le rôle `admin`.
- Les entrées sont validées et nettoyées; secrets et rôles ne sont jamais exposés dans les réponses.

### Voir aussi
- Voir `/web/lib/profile/client.ts` pour l'intégration API côté frontend.
- Voir `/api/src/routes/profile.ts` et `/api/src/routes/admin.ts` pour la logique backend.
