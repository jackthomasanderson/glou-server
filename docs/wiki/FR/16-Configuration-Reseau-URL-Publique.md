# Configurer l'URL publique & le mode d'accès réseau

## TL;DR
Indiquez à Glou l'adresse utilisée pour joindre votre instance depuis l'extérieur, pour que les liens et partages générés par l'application soient corrects, puis lancez la vérification de cohérence.

## Prérequis
* Compte administrateur.
* L'adresse publique exacte de votre instance (ex : `https://cave.example.com`), si vous en avez une.

## Action

### Définir l'URL publique
1. Allez dans **Admin → Configuration système → Accès**.
2. Renseignez **URL publique** avec l'adresse à laquelle votre instance est joignable depuis l'extérieur (ex : `https://cave.example.com`). Laissez vide pour se replier sur la variable d'environnement `APP_URL`, ou sur `http://localhost:3000` si cette variable n'est pas non plus définie.
3. Cliquez sur **Enregistrer**. Le panneau affiche l'**URL effective** réellement utilisée (votre valeur configurée, ou le repli sur `APP_URL` si le champ est resté vide). Les liens de réinitialisation du mot de passe sont construits à partir de cette URL : l'enregistrement demande donc votre mot de passe, et un code de votre application d'authentification si votre compte a la double authentification. Les réglages du serveur de messagerie, de Gotify et des canaux de notification demandent la même chose. Les QR codes des bouteilles utilisent aussi cette URL (sauf si c'est une adresse `localhost`), pour que les étiquettes imprimées depuis n'importe quel poste s'ouvrent sur un téléphone.

### Lancer la vérification de cohérence
1. Cliquez sur **Vérifier la cohérence**.
2. Le contrôle est purement local et n'effectue aucun appel réseau sortant : il n'échoue donc pas à cause du DNS ou d'un proxy pas encore actif. Il vérifie :
   - Que l'URL effective est syntaxiquement valide.
   - En production (`NODE_ENV=production`), que l'URL utilise `https://`, sinon vous obtenez un avertissement `NOT_HTTPS_IN_PRODUCTION`.
3. Lisez le résultat : les avertissements sont consultatifs, pas bloquants : le contrôle ne renvoie `ok: false` que si l'URL elle-même est invalide.

> [!TIP]
> L'URL publique ne configure aucun comportement serveur lié au proxy. Le nombre de reverse proxies de confiance se règle dans `.env` avec `TRUSTED_PROXY_HOPS`, voir ci-dessous.

### Adresse du client et reverse proxy
Le formulaire de connexion et l'API limitent le nombre de requêtes par adresse (par exemple 20 tentatives de connexion toutes les 15 minutes). Pour cela, le conteneur `web` détermine l'adresse de chaque client et ne transmet que celle-là à l'API, quoi que le client ait écrit dans son propre en-tête `X-Forwarded-For`. `TRUSTED_PROXY_HOPS` dans `.env` lui indique combien de reverse proxies se trouvent devant lui :

| Votre installation | `TRUSTED_PROXY_HOPS` | Adresse retenue |
|---|---|---|
| Un reverse proxy devant `web` (Caddy, Traefik, nginx…), le cas courant | `1` (défaut, rien à régler) | L'adresse que votre proxy ajoute à `X-Forwarded-For`. |
| `web` accessible directement (port 3000 ouvert sur le réseau, sans proxy) | `0` | L'adresse de la connexion elle-même. Un `X-Forwarded-For` forgé est ignoré. |
| Deux proxies à la suite (ex. un CDN, puis Caddy) | `2` | L'adresse ajoutée par le premier proxy. |

- Votre reverse proxy doit **ajouter** l'adresse du client à `X-Forwarded-For` : Caddy et Traefik le font par défaut ; avec nginx, utilisez `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.
- Une requête qui porte moins d'adresses que prévu (quelqu'un qui atteint `web` sans passer par votre proxy) est comptée sur l'adresse de sa propre connexion, jamais sur une adresse partagée par tous les membres.
- Si `web` est accessible directement alors que `TRUSTED_PROXY_HOPS` vaut encore `1`, un client peut choisir l'adresse sur laquelle il est compté : les mauvais mots de passe restent freinés par la limite par compte, mais mettez `0` pour fermer cette brèche.
- Redémarrez après l'avoir changé : `docker compose up -d`. Laissez le port de l'API (3001) non publié, comme dans le `docker-compose.yml` par défaut : l'API ne fait confiance qu'au conteneur `web`.

### Autoriser ou fermer l'inscription de nouveaux comptes
L'inscription est **fermée par défaut** : dès que le premier compte (l'admin de l'instance) existe, `POST /api/auth/register` répond `REGISTRATION_CLOSED` et la page de connexion masque le lien d'inscription.
1. Dans ce même onglet **Accès**, sous **Qui peut rejoindre l'instance**, activez **Autoriser l'inscription de nouveaux comptes** pour laisser les gens créer leur compte, ou désactivez-le pour refermer, puis cliquez sur **Enregistrer**. L'ouverture se confirme avec votre mot de passe, plus votre code si votre compte a la double authentification : une session volée seule ne peut laisser entrer personne. La fermeture ne demande aucune confirmation. Le bloc Membres de la page d'administration indique si les inscriptions sont ouvertes, avec un lien vers ce réglage.
2. Les comptes existants ne sont pas touchés. Le premier compte d'une instance vide peut toujours être créé.

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Avertissement `NOT_HTTPS_IN_PRODUCTION`** | Votre URL effective utilise `http://` alors que `NODE_ENV=production`. Définissez une **URL publique** en `https://`, ou corrigez la terminaison TLS au niveau du proxy. |
| **Les liens générés par l'application pointent toujours vers la mauvaise adresse** | Vérifiez que vous avez bien cliqué sur **Enregistrer** après avoir saisi l'URL publique, et recontrôlez l'**URL effective** affichée dans le panneau : un champ vide se replie silencieusement sur `APP_URL`/`localhost`. |
| **Quelqu'un ne peut pas s'inscrire : « L'inscription de nouveaux comptes est actuellement fermée »** | Activez **Autoriser l'inscription de nouveaux comptes** dans cet onglet, laissez la personne s'inscrire, puis désactivez-le. |
| **Je n'ai pas configuré d'URL publique. Est-ce un problème ?** | Pas pour un usage local/mono-utilisateur. Sans elle, Glou se replie sur `APP_URL` (défini dans votre `docker-compose.yml`) ou sur `http://localhost:3000`. Ne définissez une URL publique que si l'instance est joignable depuis l'extérieur et que vous voulez que les liens le reflètent. |
