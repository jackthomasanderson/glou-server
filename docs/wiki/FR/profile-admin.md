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
- Erreur de validation : la couleur d'accent doit respecter le format `#RRGGBB`; les URLs webhook/Gotify doivent être valides.
- Test de notification en échec : l'API retourne le code HTTP distant; vérifiez l'URL, les firewalls ou un éventuel HTTPS manquant.
- Section admin absente : votre compte n'est pas admin; seul le premier utilisateur ou ceux promus via l'admin peuvent la voir.
- Changements non visibles : la requête a échoué ou le cache n'a pas été invalidé; rechargez la page et vérifiez les journaux API.
