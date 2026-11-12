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
> L'URL publique ne configure ni le `trust proxy` d'Express ni aucun comportement serveur lié au proxy. Si votre reverse proxy doit transmettre des en-têtes spécifiques, configurez-le au niveau du proxy/déploiement.
>
> L'API fait confiance à un seul relais : elle lit l'adresse du client dans la dernière entrée de `X-Forwarded-For`, ajoutée par ce qui lui transmet la requête. Laissez le port de l'API (3001) non publié, comme dans le `docker-compose.yml` par défaut, pour qu'elle ne soit joignable qu'à travers le conteneur `web`. Jointe directement, un client pourrait choisir sa propre adresse dans cet en-tête et obtenir un nouveau quota de connexion par adresse à chaque requête (les mauvais mots de passe restent limités par compte).

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
