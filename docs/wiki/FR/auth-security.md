# Connexion, 2FA et sessions

## TL;DR
Mot de passe minimum 12 caractères; le premier compte est admin. La 2FA TOTP est optionnelle et se gère dans l'écran Sécurité.
Les sessions sont stockées en base; vous pouvez les révoquer ou marquer un appareil comme fiable.

## Prérequis
- Frontend et API en cours d'exécution avec Postgres accessible.
- Un compte créé via `/register` (le premier est admin par défaut).
- Horloge système à l'heure pour générer les codes TOTP.

> [!CAUTION]
> Les secrets TOTP et les codes de récupération sont stockés en base. Protégez l'accès à la base et sauvegardez les codes fournis lors de l'activation.

## Action
1. Créez un compte : allez sur `/register`, saisissez identifiant, email, mot de passe (12+), puis validez.
2. Connectez-vous : `/login` demande identifiant et mot de passe. Si le compte a la 2FA active, une étape de code s'affiche.
3. Activez la 2FA : dans `/security`, cliquez sur activer, scannez le QR ou copiez le secret, notez les codes de récupération, saisissez le code à 6 chiffres pour confirmer.
4. Désactivez la 2FA : toujours dans `/security`, cliquez sur désactiver (le mot de passe est demandé pour confirmer).
5. Gérer les sessions : dans la section Sessions, marquez un appareil comme fiable ou révoquez une session distante; l'état se met à jour via l'API.
6. Déconnexion : via le menu utilisateur, choisissez Déconnexion pour supprimer la session courante.

## Pourquoi ça ne marche pas ?
- Code 2FA refusé : vérifiez l'heure du poste et la limite de 6 chiffres; réessayez avec un code de récupération en majuscules avec tirets.
- Boucle de connexion : le cookie `session_token` manque; assurez-vous de passer par le proxy `/api/auth/*` et que le domaine/port du frontend matche `CORS_ORIGIN`.
- Révocation ou confiance d'appareil sans effet : l'API ne stocke pas le nom d'appareil et ne renvoie pas de confirmation visible; rechargez la page pour voir l'état réel.
- 403 sur `/admin/*` : seuls les comptes au rôle `admin` (le premier utilisateur ou ceux promus) peuvent y accéder.

### Migrations

- `db/init/02-auth-schema.sql` — tables d'auth (users, sessions, ...).
- `db/init/03-feat-03-profiles-roles.sql` — ajoute les colonnes de profil (displayName, avatar, `accent_color`).
- `db/init/07-migrate-accent-color.sql` — migration optionnelle pour remplacer les accents dorés hérités par `#2563EB`.
