# Reprise après sinistre : reconstruire Glou sur une nouvelle machine

## En bref
Pour tout reconstruire il faut trois choses : la **sauvegarde de la base** (`.sql.gz`), votre **`.env`** (mêmes secrets) et les **photos** (le volume Docker `api_uploads`). La sauvegarde intégrée ne couvre que la base, et par défaut elle est stockée sur la même machine que les données : copiez-la ailleurs.

> [!IMPORTANT]
> **Les photos ne sont pas dans `./backups`.** Un outil de sauvegarde pointé sur le dossier du projet (restic, un snapshot NAS, rsync…) récupère les sauvegardes de la base mais pas les photos : elles restent dans le volume `api_uploads`, sous `/var/lib/docker`. Archivez-les avec la commande de [Sauvegarder les photos](#sauvegarder-les-photos), et laissez votre outil de sauvegarde récupérer aussi cette archive.

## Ce qui est (et n'est pas) dans une sauvegarde

| Donnée | Où elle se trouve | Dans la sauvegarde intégrée ? |
|---|---|---|
| Comptes, inventaire, caves, dégustations, réglages | PostgreSQL (volume `db_data`) | Oui |
| Photos (bouteilles, avatars, photos de scan) | volume `api_uploads` (`/app/uploads`) | **Non** |
| Les fichiers de sauvegarde eux-mêmes | dossier `./backups`, à côté de `docker-compose.yml` (`/app/backups` dans le conteneur de l'API) | sans objet |
| Secrets (`JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`) | votre `.env` | **Non** |

Si le disque de la machine meurt, les fichiers de sauvegarde meurent avec, sauf si vous les avez copiés ailleurs.

## Prérequis (à faire *avant* d'en avoir besoin)
1. Sauvegardes activées : Admin → Configuration système → Données → **Activé**.
2. Copiez régulièrement hors de la machine : le fichier le plus récent du dossier `./backups` (ou **Télécharger** depuis l'historique), votre `.env`, et l'archive des photos faite par [Sauvegarder les photos](#sauvegarder-les-photos).
   > [!NOTE]
   > S'il existe encore un ancien volume `api_backups`, il ne contient que des sauvegardes antérieures à la mise à jour 2026.10 ; vérifiez la date avant d'en restaurer une.
3. Sachez où sont rangés votre `docker-compose.yml` et votre `.env`.

## Reconstruire sur une nouvelle machine
1. Installez Docker et placez votre `docker-compose.yml` et **le même `.env`** sur la nouvelle machine (en particulier la même `CONFIG_ENCRYPTION_KEY`).
2. Démarrez la pile : `docker compose up -d`. L'API crée une base vide.
3. **Dans l'application**, le plus simple, quand la nouvelle machine fait tourner la même version de Glou que celle qui a pris la sauvegarde :
   - Copiez le fichier de sauvegarde, sans le renommer (`glou-backup-….sql.gz`), dans le dossier `./backups` à côté de `docker-compose.yml`, puis redémarrez l'API : `docker compose restart api`. Au démarrage, l'API ajoute à l'historique des sauvegardes chaque fichier de sauvegarde de ce dossier (un fichier tronqué est écarté).
   - Créez le premier compte : il est l'admin de cette instance encore vide.
   - Ouvrez Admin → Configuration système → Données, trouvez la sauvegarde dans l'historique des sauvegardes et choisissez **Restaurer**. Glou demande le mot de passe du compte que vous venez de créer, puis prend une sauvegarde de la base actuelle (vide), puis restaure.
   - Une fois la restauration faite, connectez-vous avec un compte de la sauvegarde, puis reprenez à l'étape 6 (photos).

   Si Glou répond que la sauvegarde a été prise par une autre version, utilisez plutôt la ligne de commande des étapes 4 et 5.
4. **Ou en ligne de commande.** Vérifiez que le fichier de sauvegarde est complet. Cette commande n'affiche rien si le fichier est bon :
   ```bash
   gunzip -t glou-backup-XXXX.sql.gz
   ```
   > [!CAUTION]
   > Ne sautez pas cette étape. La commande suivante remplace toute la base ; si le fichier est tronqué (copie interrompue, disque plein), elle peut quand même se terminer « avec succès » sur une base vide ou partielle. Le bouton **Restaurer** de l'application détecte ce cas ; cette commande manuelle non.

   Puis restaurez-le :
   ```bash
   (printf 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n'; gunzip -c glou-backup-XXXX.sql.gz | sed '/^SET transaction_timeout/d') \
     | docker compose exec -T db psql -U glou -d glou_db -v ON_ERROR_STOP=1 --single-transaction
   ```
   Une erreur SQL dans le fichier annule toute la restauration ; un fichier tronqué, c'est le rôle de la vérification `gunzip -t` ci-dessus. La partie `sed` retire un réglage que contiennent les anciennes sauvegardes et que PostgreSQL 15 refuse ; elle ne change rien aux sauvegardes plus récentes. Si vous avez changé `DB_USER` ou `DB_NAME` dans votre `.env`, utilisez ces valeurs à la place de `glou` et `glou_db`.
5. Redémarrez l'API pour qu'elle applique les mises à jour de base postérieures à la sauvegarde : `docker compose restart api`.
6. Restaurez les photos dans le volume `api_uploads`, depuis le dossier de votre `docker-compose.yml`, la pile démarrée (étape 2) :
   ```bash
   gzip -t glou-photos.tar.gz
   docker compose exec -T -u 0 api sh -c 'tar xzf - -C /app/uploads && chown -R 1001:1001 /app/uploads' < glou-photos.tar.gz
   ```
   La première commande n'affiche rien quand l'archive est complète. La seconde la décompresse dans le volume et rend les fichiers à l'utilisateur de l'API (`1001`).
7. Vérifiez : connectez-vous, ouvrez une cave, envoyez un email de test (Admin → Configuration système → Notifications → E-mail → Tester la connexion).

## Sauvegarder les photos
Les photos (photos des bouteilles, avatars, photos de scan d'étiquette) se trouvent dans le volume Docker `api_uploads`, monté sur `/app/uploads` dans le conteneur de l'API. Elles ne sont **pas** dans la sauvegarde intégrée et **pas** dans `./backups`. Depuis le dossier de votre `docker-compose.yml`, la pile démarrée :
```bash
docker compose exec -T api tar czf - -C /app/uploads . > glou-photos.tar.gz
```
Cela écrit `glou-photos.tar.gz` à côté de `docker-compose.yml`, là où un outil de sauvegarde pointé sur le dossier du projet le récupère. Gardez `-T` : sans lui, l'archive est abîmée. Vérifiez-la :
```bash
gzip -t glou-photos.tar.gz && tar tzf glou-photos.tar.gz | head
```
La première partie n'affiche rien quand l'archive est complète ; la seconde liste les premiers fichiers (`./products/…`, `./avatars/…`).

Pour la refaire chaque nuit, ajoutez une ligne à la crontab d'un utilisateur qui a le droit de lancer `docker` (`crontab -e`), par exemple à 3 h 30, après la sauvegarde de la base :
```bash
30 3 * * * cd /chemin/vers/glou && docker compose exec -T api tar czf - -C /app/uploads . > glou-photos.tar.gz.tmp && mv glou-photos.tar.gz.tmp glou-photos.tar.gz
```
N'écrivez pas cette archive dans `./backups` : ce dossier est réservé aux sauvegardes de la base que Glou fait et liste lui-même.

Pour la restaurer, voyez l'étape 6 de [Reconstruire sur une nouvelle machine](#reconstruire-sur-une-nouvelle-machine) ; la même commande restaure les photos sur la même machine.

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| La sauvegarde copiée n'est pas dans l'historique des sauvegardes | Redémarrez l'API après la copie (`docker compose restart api`), gardez le nom en `glou-backup-` et l'extension `.sql.gz`, et vérifiez que l'API peut lire le fichier (`sudo chown 1001:1001 backups/*`). Un fichier tronqué n'est jamais listé : vérifiez-le avec `gunzip -t`. |
| `gunzip -t` signale `unexpected end of file` ou `not in gzip format` | Le fichier est incomplet : recopiez-le, ou utilisez une sauvegarde plus ancienne. Ne le restaurez pas. |
| La restauration s'arrête avec des erreurs `already exists` | Le schéma n'a pas été réinitialisé : gardez la première ligne `printf` de la commande. |
| La restauration s'arrête avec `unrecognized configuration parameter "transaction_timeout"` | La partie `sed '/^SET transaction_timeout/d'` de la commande manque : recopiez la commande en entier. |
| La restauration s'arrête avec `invalid command \restrict` | L'image de la base sur cette machine est antérieure à PostgreSQL 15.14 : mettez-la à jour avec `docker compose pull db && docker compose up -d db`, puis relancez la commande. |
| Tout est revenu mais les emails/Gotify échouent | `CONFIG_ENCRYPTION_KEY` diffère de celle de la sauvegarde. Utilisez le `.env` d'origine, ou ressaisissez les réglages comme décrit dans [Changer les secrets](./29-Rotation-Des-Secrets.md). |
| Les photos des bouteilles manquent | Les photos n'ont pas été restaurées : elles ne font partie ni de la sauvegarde de la base ni de `./backups`. Restaurez l'archive des photos (étape 6). |
