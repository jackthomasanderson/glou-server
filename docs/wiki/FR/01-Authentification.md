# Se connecter à l'API et accéder aux routes protégées

**TL;DR** : L'authentification utilise un cookie HttpOnly. Envoyez vos requêtes de login/register via `credentials: 'include'` pour recevoir et utiliser automatiquement le token.

## Prérequis
- Frontend et Backend doivent tourner localement (ports respectifs 3000 et 3001).
- La base de données PostgreSQL doit être accessible en local (via `docker-compose up -d db`).

## Action : Flux de connexion

1. Appelez l'endpoint `POST /api/auth/register` (ou `/login`) avec votre `email` (ou `username`) et `password`.
2. Assurez-vous d'avoir configuré le client web pour inclure les credentials afin d'accepter le cookie `accessToken` retourné.
   *Exemple (fetch)* : `fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({...}), credentials: 'include' })`
3. Dès que le login est réussi, le navigateur stockera le cookie en arrière-plan.
4. Pour les appels vers les routes protégées (`/api/bottles` ou `/api/auth/me`), aucune action n'est requise. Le paramètre `credentials: 'include'` fera transiter le token de session automatiquement.

> [!TIP]
> Sur Next.js, notre abstraction Axios / Fetch gère déjà le passage des cookies.

> [!CAUTION]
> N'essayez jamais d'extraire le cookie en JS (`document.cookie`). Ce dernier est strictement limité au backend via le flag HttpOnly, pour prévenir les attaques XSS.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Symptôme | Cause Probable | Solution |
| :--- | :--- | :--- |
| `500 Internal Server Error` (sur `/api/auth/*`) | Connexion à la base de données PostgreSQL perdue (`P1001` ou `P1012`). | Vérifiez que le conteneur Docker `db` tourne : `docker-compose up -d db` et relancez le backend s'il n'arrive pas à se reconnecter. |
| `401 Unauthorized` sur `/api/bottles` | Le cookie JWT n'a pas été envoyé, est expiré ou absent du header. | Assurez-vous que le client HTTP frontend a bien la configuration `credentials: 'include'` (déjà en place sur HttpClient natif) et que l'utilisateur s'est bien loggué. |
| `404 Not Found` sur affichage web des formulaires | Fichiers de traduction (`common.json`) manquants ou mal chargés. | Assurez-vous d'avoir importé `i18n.ts` et que le service API n'a pas crashé, bloquant les requêtes de traduction dynamiques. |
