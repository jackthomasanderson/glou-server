# Démarrer Glou en local

## TL;DR
Lancez Postgres (docker), puis l'API sur 3001 et le frontend Next sur 3000; le premier compte créé devient admin.
Gardez le proxy `/api/...` du frontend pointé vers l'API pour que le cookie `session_token` soit posé correctement.

## Implémenté

- 🍷 FEAT-01 : Ajout et rangement express (création/modification/suppression/restauration, sauvegardes optimistes).
- 👤 FEAT-03 : Profil et préférences (préférences utilisateur persistantes, accents).
- 🔐 FEAT-02 : TOTP 2FA (connexion avec TOTP + codes de récupération).
- 🏠 FEAT-24 : Gestion des celliers (schéma et APIs de celliers).
- 💾 FEAT-55 : Persistance des bouteilles dans PostgreSQL.

## Prérequis
- Docker pour Postgres (ou un PostgreSQL accessible) + ouverture des ports 5432/3001/3000.
- Node 20+ et npm pour lancer l'API et le frontend.
- Variables DB cohérentes : `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- (Optionnel) `NEXT_PUBLIC_API_URL` si l'API n'est pas exposée sur `http://localhost:3001/api`.

## Action
1. Démarrez Postgres : `docker compose up -d db` (utilise les scripts `db/init` pour créer les tables users/sessions/caves).
2. Préparez l'API : dans `api`, ajoutez un fichier `.env` si besoin (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `API_PORT=3001`).
3. Installez les dépendances : `npm install --prefix api` puis `npm install --prefix web`.
4. Lancez l'API : `npm run dev --prefix api` puis vérifiez `http://localhost:3001/health`.
5. Lancez le frontend : `npm run dev --prefix web -- -p 3000` et, si l'API n'est pas sur 3001, définissez `NEXT_PUBLIC_API_URL` vers la base de l'API (ex: `http://localhost:3001/api`).
6. Ouvrez `http://localhost:3000/register` pour créer le premier compte (il reçoit le rôle admin) puis connectez-vous.

## Pourquoi ça ne marche pas ?
- 401 ou boucle de login : le cookie `session_token` n'est pas posé; assurez-vous que le frontend appelle bien `/api/...` (proxy) ou que `CORS_ORIGIN` côté API accepte `http://localhost:3000`.
- Erreur DB au démarrage API : Postgres n'est pas prêt ou les variables DB sont erronées; testez la connexion avec `psql` et vérifiez `DB_HOST/DB_USER/DB_PASSWORD`.
- 404 sur `/api/*` : le serveur Next n'est pas lancé ou `NEXT_PUBLIC_API_URL` pointe vers une URL invalide.
- Tables manquantes en mode sans Docker : appliquez manuellement les fichiers SQL `db/init/02-auth-schema.sql`, `03-feat-03-profiles-roles.sql`, `04-feat-24-caves.sql` sur votre base.
