# Mettre à jour Glou et revenir en arrière en cas de problème

## En bref
Glou applique ses migrations de base automatiquement au démarrage de l'API, et **les migrations ne vont que vers l'avant** : il n'existe pas de migration « inverse ». Revenir en arrière signifie restaurer la sauvegarde faite avant la mise à jour, avec l'image précédente. **Glou prend cette sauvegarde lui-même** quand une mise à jour apporte des migrations de base : un fichier `glou-backup-before-migration-<date>.sql.gz` dans le dossier `./backups`, à côté de `docker-compose.yml`. Notez l'image que vous utilisez avant de mettre à jour.

## Prérequis
* Accès shell à la machine.
* Sous Linux, le dossier `backups` à côté de `docker-compose.yml` doit appartenir à l'uid 1001 : `mkdir -p backups && sudo chown 1001:1001 backups`. Sinon la sauvegarde automatique échoue, et l'API ne démarre pas (rien n'est migré).
* Avec Portainer, Synology Container Manager ou une autre interface, ce dossier n'existe pas : associez `/app/backups` à un chemin absolu de l'hôte appartenant à l'uid 1001 (voir [Installation](./01-Installation.md), **Portainer, Synology Container Manager ou une autre interface**). L'interface signale seulement le conteneur `api` comme « unhealthy » ; la raison est dans son journal (**Containers → `<pile>-api-1` → Logs** dans Portainer).
* La sauvegarde de la base suffit à annuler les changements de schéma ; les photos ne sont pas touchées par les migrations.

## La sauvegarde prise avant de migrer
* Quand l'API démarre et trouve des migrations qu'elle n'a pas encore appliquées, sur une instance qui a déjà au moins un compte, elle sauvegarde d'abord toute la base, avec le même `pg_dump` que la sauvegarde nocturne. Une nouvelle installation, ou une mise à jour sans migration, ne prend pas cette sauvegarde.
* Le fichier est `./backups/glou-backup-before-migration-<date>.sql.gz` (`/app/backups` dans le conteneur). Une fois l'API démarrée, il apparaît aussi dans Admin → Configuration système → Données, d'où vous pouvez le télécharger.
* Il est **conservé jusqu'à ce que vous le supprimiez** : la rétention (7 jours par défaut) ne l'efface jamais, car c'est le seul moyen de revenir à la version précédente. Supprimez-le de `./backups` quand vous faites confiance à la mise à jour.
* S'il ne peut pas être écrit, rien n'est migré et l'API ne démarre pas : le journal de l'`api` dit pourquoi (voir Dépannage).
* Une sauvegarde manuelle avant la mise à jour (Admin → Configuration système → Données → **Sauvegarder maintenant**) reste possible, mais n'est plus nécessaire.

> [!WARNING]
> Vous mettez à jour une instance déployée avant que `docker-compose.yml` n'exige `DB_PASSWORD` ? Elle tourne peut-être encore avec l'ancien mot de passe de repli, public dans l'historique git de ce dépôt. Changez-le : voir [Changer les secrets](./29-Rotation-Des-Secrets.md#changer-db_password).

## Mettre à jour
1. Notez les images utilisées pour pouvoir y revenir :
   ```bash
   docker compose images
   docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/jackthomasanderson/glou-server-api:latest
   docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/jackthomasanderson/glou-server-web:latest
   ```
   Conservez les deux lignes `…@sha256:…`.
2. Téléchargez et recréez : `docker compose pull && docker compose up -d`.
3. Surveillez le journal de l'API : `docker compose logs -f api`. Quand la mise à jour apporte des migrations, vous devez voir `[backup] Backup taken before migrating: /app/backups/glou-backup-before-migration-….sql.gz`, puis les migrations s'appliquer, puis `Server listening`. Sans migration : `[backup] No pending migration: no backup needed.`

## La mise à jour qui regroupe vos bouteilles en lignes
Une mise à jour peut transformer vos données. Celle qui introduit les **lignes de bouteilles identiques** (un vin = une carte, « ×6 ») le fait **une seule fois**, au premier démarrage de l'API, après la sauvegarde automatique. Elle est appliquée en entier ou pas du tout, et vérifie avant de finir que vos totaux (nombre de bouteilles et de cigares, valeur, dépenses, dégustations, historique, cases du plan de cave, collections, inventaires) sont identiques à ceux d'avant : au moindre écart, elle s'annule et l'API ne démarre pas (voir Dépannage). Elle prend quelques secondes pour quelques milliers de bouteilles.

Ce qui change dans vos données :
* **Les bouteilles identiques sont regroupées.** Les enregistrements d'un même vin (même catégorie, producteur, nom et millésime, sans tenir compte des majuscules ni des espaces) deviennent un seul vin si leurs descriptions ne se contredisent pas (une valeur vide n'est pas un désaccord). Les bouteilles strictement identiques (même cave, prix, contenance, date d'achat et valeur estimée, avec un lieu d'achat et un emplacement qui ne se contredisent pas, aucune entamée) forment une ligne « ×N » ; un vin racheté à une autre date garde une ligne par date. Les bouteilles signalées « à vérifier » ne sont jamais fusionnées. Avant la mise à jour aucune bouteille n'avait de date d'achat : pour les bouteilles déjà enregistrées, c'est le jour où vous les avez ajoutées à Glou ; 6 bouteilles identiques saisies sur deux jours différents forment donc deux lignes, et le budget les compte chacune à ce jour. Les photos et notes différentes ne bloquent pas : la photo la plus récente est gardée (les autres restent consultables) et les notes sont mises bout à bout avec leur date. Les bouteilles entamées, celles qui occupent une case du plan (réunies par la mise à jour suivante, voir plus bas) ou comptées dans une même session de comptage restent des lignes à part.
* **Les quantités.** Une quantité vide compte pour 1. Une quantité supérieure à 1 saisie avec l'ancien bouton « Incrémenter la quantité » est conservée et compte enfin.
* **Les cigares** deviennent des **boîtes** contenant le nombre de cigares qui leur restait : fermées, ou entamées si l'enregistrement l'était ; un enregistrement vidé devient une boîte finie.
* **Les vins « connus mais non détenus »** (anciennes références) deviennent des vins **sans bouteille**, visibles sous le filtre **Plus en cave**.
* **Les bouteilles entamées ou finies comptant plusieurs bouteilles** (ancien enregistrement avec quantité 3, entamé) sont découpées au mieux : une bouteille entamée (ou finie) et le reste en bouteilles pleines. Glou ne peut pas deviner juste à tous les coups : ces cas sont signalés dans **À vérifier**.
* **Les modèles d'actions groupées** qui modifiaient un état (entamée, niveau, date d'ouverture) sont supprimés entièrement.
* Dans de rares cas (plus de 200 caractères de libellés de collection différents), le surplus est ajouté aux notes du vin, daté et précédé de « Libellés d'origine : » — tous les libellés y sont recopiés, pas seulement le surplus. La même mention est écrite quand vous regroupez des vins dans **À regrouper ?**. Elle est en français quelle que soit votre langue.

### À vérifier après la mise à jour
Ce que Glou n'a pas pu trancher seul est listé dans **À vérifier après la mise à jour**, derrière une bannière sur la liste des vins (**Voir** / **Plus tard** ; **Plus tard** la repousse à votre prochaine connexion). Un point traité par un membre disparaît pour tous.
* **À regrouper ?** : des vins de même nom restés séparés parce que leurs descriptions se contredisaient (région, couleur, apogée…). Seuls les champs en désaccord sont montrés côte à côte, déjà cochés sur le vin le plus récent : cochez la valeur à garder puis **Regrouper** (définitif), ou **C'est un autre vin** : les deux vins ne vous seront plus jamais proposés ensemble. Les notes de plus de 2 000 caractères ou plus de 20 étiquettes sont conservées mais à raccourcir avant de modifier la description.
* **Nombres à vérifier** : une ligne découpée au mieux, avec ce qu'elle était avant la mise à jour (« Avant la mise à jour : 3 bouteilles, entamée. Glou a compté 1 entamée + 2 pleines »). **C'est bon** confirme, **Corriger le nombre** ajuste.
Rien n'est perdu si vous ne faites rien : les vins restent séparés, les nombres restent ceux que Glou a comptés. Le **journal des mouvements** de chaque vin (sa section **Mouvements**) commence plus tard, à la mise à jour qui l'apporte, par une ligne « Mise à jour : N en cave » ; l'historique des modifications d'avant reste consultable sur chaque vin.

## La mise à jour qui donne sa case à chaque bouteille du plan
La mise à jour qui permet à une ligne d'occuper plusieurs cases du plan de cave (une case par bouteille) transforme elle aussi vos données **une seule fois**, au premier démarrage de l'API, après la sauvegarde automatique. Elle est appliquée en entier ou pas du tout, et vérifie avant de finir que vos totaux (nombre de bouteilles et de cigares, valeur et dépenses par catégorie), vos dégustations, votre historique, vos inventaires, votre liste de souhaits et **chaque case occupée** sont identiques à ceux d'avant : au moindre écart, elle s'annule et l'API ne démarre pas (voir Dépannage).

Ce qui change dans vos données :
* **Chaque case occupée est gardée**, avec sa bouteille, y compris celle d'une bouteille à la corbeille (restaurée, la bouteille retrouve sa case si celle-ci est encore libre).
* **Les lignes identiques restées séparées** à la mise à jour précédente **seulement parce que chacune avait sa case** sont réunies en une ligne qui garde toutes leurs cases. Les règles sont celles de la mise à jour précédente (même vin, cave, prix, contenance, date d'achat et valeur estimée, lieu d'achat et emplacement qui ne se contredisent pas, aucune entamée ni « à vérifier ») ; deux lignes comptées dans une même session de comptage restent séparées.
* **Les cigares à l'unité** ne sont jamais réunis s'ils occupaient chacun une case : un groupe de cigares à l'unité n'occupe qu'une case.
* **Les coordonnées sans cave** (une bouteille sortie de sa cave qui gardait sa position) sont abandonnées, comme celles d'une bouteille bue ou sortie, à moitié remplies ou hors des valeurs possibles (1 à 100). Elles n'apparaissaient sur aucun plan.

Pour revenir en arrière, restaurez `glou-backup-before-migration-….sql.gz` avec l'image précédente (voir ci-dessous) : tout ce que vous avez saisi après la mise à jour est perdu.

## Revenir en arrière
Chaque version stable est publiée sous un tag immuable du type `v2026.10.0` (`vAAAA.MM`, ou `vAAAA.MM.PATCH`), en plus des tags `latest`/`beta` qui eux sont mutables. Contrairement à ceux-ci, un tag de version n'est jamais réécrit : **fixez les deux images sur le tag de la version que vous faisiez tourner avant la mise à jour** (la liste des versions se trouve dans le CHANGELOG, ou sur la page des packages GHCR). Inutile d'avoir une copie du dépôt ni d'avoir noté un digest.

En secours, si vous ne connaissez pas cette version : chaque build est aussi publié sous un tag `sha-` suivi du hash de commit complet qui l'a généré (par ex. `…glou-server-api:sha-a1b2c3…`), et vous pouvez revenir par **digest** si vous l'avez noté avant la mise à jour. Pour lire le commit d'une image encore présente sur la machine : `docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' <image>` affiche le hash seul : fixez l'image sur `:sha-` suivi de ce hash.

1. Arrêtez la pile : `docker compose down` (cela conserve vos volumes).
2. Dans `docker-compose.yml`, fixez les deux images sur le tag de version voulu, par exemple `image: ghcr.io/jackthomasanderson/glou-server-api:v2026.10.0` (idem pour `glou-server-web`), ou, en secours, sur un tag SHA de commit ou les digests notés, par ex. `image: ghcr.io/jackthomasanderson/glou-server-api@sha256:…`.
3. Démarrez seulement la base : `docker compose up -d db`.
4. Restaurez la sauvegarde faite avant la mise à jour (le fichier `glou-backup-before-migration-….sql.gz` du dossier `./backups`, à côté de `docker-compose.yml` ; si la mise à jour n'apportait aucune migration, votre dernier `glou-backup-….sql.gz`) avec les deux commandes de l'étape 4 de [Reprise après sinistre](./30-Reprise-Apres-Sinistre.md) : vérifiez le fichier, puis restaurez-le.
5. Démarrez tout : `docker compose up -d`. L'ancienne API trouve une base conforme à sa version et démarre normalement.

> [!CAUTION]
> Ne démarrez **pas** une ancienne API sur une base déjà migrée par une plus récente sans restaurer d'abord : elle peut tourner, mais avec des colonnes ou tables qu'elle ne connaît pas, et les données écrites entre-temps peuvent être perdues ou corrompues.

> [!NOTE]
> Tout ce qui a été saisi entre la sauvegarde et le retour arrière est perdu. Pour le conserver, exportez d'abord ce dont vous avez besoin (Profil → Données & confidentialité → Exporter).

> [!WARNING]
> Pour une mise à jour qui transforme vos données comme celle-ci, revenir en arrière **ne se fait que par la restauration** de `glou-backup-before-migration-….sql.gz` avec l'image précédente : le retour est impossible en gardant les données actuelles, qui ont un autre format. Tout ce que vous avez saisi après la mise à jour (bouteilles ajoutées ou bues, dégustations, points « À vérifier » traités) est perdu. Si vous restaurez cette sauvegarde en gardant la **nouvelle** version, la transformation se rejoue au redémarrage de l'API, et les points « À vérifier » reviennent. Restaurer cette sauvegarde depuis le bouton **Restaurer** de l'administration est refusé : une sauvegarde d'une autre version se restaure avec la commande de [Reprise après sinistre](./30-Reprise-Apres-Sinistre.md).

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| L'API redémarre en boucle après une mise à jour, le journal montre une erreur de migration | Ne réessayez pas à l'aveugle. Chaque redémarrage réutilise la sauvegarde déjà prise (`[backup] … No new backup: …`) : la boucle ne remplit pas le disque. Lisez la première ligne d'erreur, gardez le journal, et revenez en arrière comme ci-dessus ; ouvrez ensuite une issue avec le journal. |
| Le journal de l'API montre une erreur de migration qui commence par `families:` ou `slots:` (un total ou une case ne correspond pas) | La mise à jour s'est annulée d'elle-même et vos données sont intactes (« P3009 » au redémarrage suivant : la migration est marquée en échec). Ne forcez rien : gardez le journal, revenez à l'image précédente (voir plus haut) et ouvrez une issue avec ce journal. |
| `Erreur de migration Prisma` au premier démarrage | La base n'était pas encore prête : `docker compose restart api`. |
| L'API ne démarre pas, le journal montre `[backup] Migrations are pending, but /app/backups is not writable` | Docker a créé `./backups` en root. Rien n'a été migré. À côté de `docker-compose.yml` : `mkdir -p backups && sudo chown 1001:1001 backups`, puis `docker compose up -d`. Avec Portainer ou une autre interface (qui indique seulement que le conteneur `api` est « unhealthy ») : remplacez `./backups` par un chemin absolu de l'hôte appartenant à l'uid 1001 (`sudo mkdir -p /opt/glou/backups && sudo chown 1001:1001 /opt/glou/backups`), puis redéployez la pile. |
| L'API ne démarre pas, le journal montre `[backup] Migrations are pending, but the backup taken before migrating failed: …` | Rien n'a été migré. Lisez la cause en fin de ligne : erreur de permission ou système de fichiers en lecture seule (`sudo chown 1001:1001 backups`), disque plein (libérez de la place). Puis `docker compose up -d`. |
| `[backup] Could not check for pending migrations` | La base n'était pas encore prête, ou `DATABASE_URL` est faux. Rien n'a été migré : `docker compose restart api`. |
