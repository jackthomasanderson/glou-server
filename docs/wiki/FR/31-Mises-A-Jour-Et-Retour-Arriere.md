# Mettre à jour Glou et revenir en arrière en cas de problème

## En bref
Glou applique ses migrations de base automatiquement au démarrage de l'API, et **les migrations ne vont que vers l'avant** : il n'existe pas de migration « inverse ». Revenir en arrière signifie restaurer la sauvegarde faite avant la mise à jour, avec l'image précédente. Faites cette sauvegarde d'abord, et notez l'image que vous utilisez.

## Prérequis
* Accès shell à la machine, et une **sauvegarde fraîche** (Admin → Configuration système → Sauvegardes → **Lancer maintenant**).
* La sauvegarde de la base suffit à annuler les changements de schéma ; les photos ne sont pas touchées par les migrations.

## Mettre à jour
1. Sauvegardez (voir ci-dessus) et notez les images utilisées pour pouvoir y revenir :
   ```bash
   docker compose images
   docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/jackthomasanderson/glou-server-api:latest
   docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/jackthomasanderson/glou-server-web:latest
   ```
   Conservez les deux lignes `…@sha256:…`.
2. Téléchargez et recréez : `docker compose pull && docker compose up -d`.
3. Surveillez le journal de l'API : `docker compose logs -f api`. Vous devez voir les migrations s'appliquer, puis `Server listening`.

## Revenir en arrière
Chaque build est aussi publié sous un tag immuable nommé d'après le hash de commit complet qui l'a généré (par ex. `ghcr.io/jackthomasanderson/glou-server-api:a1b2c3…`), en plus des tags `latest`/`beta` qui eux sont mutables — contrairement à ceux-ci, ce tag n'est jamais réécrit : vous pouvez donc vous y fixer plutôt que de rechercher un digest. Retrouvez le commit que vous faisiez tourner (`git log`, ou le digest noté ci-dessous) et utilisez son tag SHA, ou revenez par **digest** si c'est tout ce que vous avez conservé.

1. Arrêtez la pile : `docker compose down` (cela conserve vos volumes).
2. Dans `docker-compose.yml`, fixez les deux images sur le tag SHA de commit voulu, par exemple `image: ghcr.io/jackthomasanderson/glou-server-api:a1b2c3…` — ou sur les digests notés, par ex. `image: ghcr.io/jackthomasanderson/glou-server-api@sha256:…`.
3. Démarrez seulement la base : `docker compose up -d db`.
4. Restaurez la sauvegarde faite avant la mise à jour, avec la commande de l'étape 3 de [Reprise après sinistre](./30-Reprise-Apres-Sinistre.md).
5. Démarrez tout : `docker compose up -d`. L'ancienne API trouve une base conforme à sa version et démarre normalement.

> [!CAUTION]
> Ne démarrez **pas** une ancienne API sur une base déjà migrée par une plus récente sans restaurer d'abord : elle peut tourner, mais avec des colonnes ou tables qu'elle ne connaît pas, et les données écrites entre-temps peuvent être perdues ou corrompues.

> [!NOTE]
> Tout ce qui a été saisi entre la sauvegarde et le retour arrière est perdu. Pour le conserver, exportez d'abord ce dont vous avez besoin (Profil → Données & confidentialité → Exporter).

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| L'API redémarre en boucle après une mise à jour, le journal montre une erreur de migration | Ne réessayez pas à l'aveugle. Lisez la première ligne d'erreur, gardez le journal, et revenez en arrière comme ci-dessus ; ouvrez ensuite une issue avec le journal. |
| `Erreur de migration Prisma` au premier démarrage | La base n'était pas encore prête : `docker compose restart api`. |
