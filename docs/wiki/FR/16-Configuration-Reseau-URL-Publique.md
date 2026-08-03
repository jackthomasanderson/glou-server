# Configurer l'URL Publique & le Mode d'Accès Réseau

## TL;DR
Indiquez à Glou l'adresse utilisée pour joindre votre instance depuis l'extérieur, pour que les liens et partages générés par l'application soient corrects — et lancez une vérification de cohérence rapide avant d'y faire confiance.

## Prérequis
* Compte administrateur.
* Connaître l'adresse publique exacte de votre instance (ex : `https://cave.example.com`), si vous en avez une.

## Action

### Définir l'URL publique et le mode d'accès
1. Allez dans **Admin → Configuration Système → Réseau**.
2. Renseignez **URL publique** avec l'adresse à laquelle votre instance est joignable depuis l'extérieur (ex : `https://cave.example.com`). Laissez vide pour se replier sur la variable d'environnement `APP_URL`, ou sur `http://localhost:3000` si cette variable n'est pas non plus définie.
3. Définissez le **Mode d'accès** :
   - **Direct** — l'instance est atteinte directement.
   - **Reverse proxy** — l'instance se trouve derrière un reverse proxy (Nginx, Traefik, Caddy, etc.).
4. Cliquez sur **Enregistrer**. Le panneau affiche l'**URL effective** réellement utilisée (votre valeur configurée, ou le repli sur `APP_URL` si le champ est resté vide).

### Lancer la vérification de cohérence
1. Cliquez sur **Vérifier la cohérence**.
2. Le contrôle est purement local — il n'effectue aucun appel réseau sortant, donc il n'échouera pas à cause du DNS ou parce que le proxy n'est pas encore actif. Il vérifie :
   - Que l'URL effective est syntaxiquement valide.
   - En production (`NODE_ENV=production`), que l'URL utilise `https://` — sinon vous obtenez un avertissement `NOT_HTTPS_IN_PRODUCTION`.
   - Si le **Mode d'accès** est **Reverse proxy** mais que l'URL effective pointe toujours vers `localhost`/`127.0.0.1`, vous obtenez un avertissement `PROXY_MODE_LOCALHOST_URL`.
3. Lisez le résultat : les avertissements sont consultatifs, pas bloquants — le contrôle ne renvoie `ok: false` que si l'URL elle-même est invalide.

> [!TIP]
> Le **Mode d'accès** est informatif : il pilote la vérification de cohérence et s'affiche comme un badge d'état dans le panneau admin, mais il ne configure ni le `trust proxy` d'Express ni aucun comportement serveur lié au proxy. Si votre reverse proxy doit transmettre des en-têtes spécifiques, configurez-le au niveau du proxy/déploiement, pas via ce réglage.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Avertissement `NOT_HTTPS_IN_PRODUCTION`** | Votre URL effective utilise `http://` alors que `NODE_ENV=production`. Définissez une **URL publique** en `https://`, ou corrigez la terminaison TLS au niveau du proxy. |
| **Avertissement `PROXY_MODE_LOCALHOST_URL`** | Le mode d'accès est **Reverse proxy** mais l'URL effective pointe toujours vers localhost. Définissez l'**URL publique** avec l'adresse externe réelle exposée par le proxy. |
| **Les liens générés par l'application pointent toujours vers la mauvaise adresse** | Vérifiez que vous avez bien cliqué sur **Enregistrer** après avoir saisi l'URL publique, et recontrôlez l'**URL effective** affichée dans le panneau — un champ vide se replie silencieusement sur `APP_URL`/`localhost`. |
| **Je n'ai pas configuré d'URL publique — est-ce un problème ?** | Pas pour un usage local/mono-utilisateur. Sans elle, Glou se replie sur `APP_URL` (défini dans votre `docker-compose.yml`) ou sur `http://localhost:3000`. Ne définissez une URL publique que si l'instance est joignable depuis l'extérieur et que vous voulez que les liens le reflètent. |
