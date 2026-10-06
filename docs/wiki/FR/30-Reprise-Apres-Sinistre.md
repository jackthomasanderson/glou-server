# Reprise après sinistre : reconstruire Glou sur une nouvelle machine

## En bref
Pour tout reconstruire il faut trois choses : la **sauvegarde de la base** (`.sql.gz`), votre **`.env`** (mêmes secrets) et le **volume des photos** (`api_uploads`). La sauvegarde intégrée ne couvre que la base, et par défaut elle est stockée sur la même machine que les données : copiez-la ailleurs.

## Ce qui est (et n'est pas) dans une sauvegarde

| Donnée | Où elle se trouve | Dans la sauvegarde intégrée ? |
|---|---|---|
| Comptes, inventaire, caves, dégustations, réglages | PostgreSQL (volume `db_data`) | Oui |
| Photos (bouteilles, avatars, photos de scan) | volume `api_uploads` (`/app/uploads`) | **Non** |
| Les fichiers de sauvegarde eux-mêmes | volume `api_backups` (`/app/backups`) | sans objet |
| Secrets (`JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`) | votre `.env` | **Non** |

Si le disque de la machine meurt, les fichiers de sauvegarde meurent avec, sauf si vous les avez copiés ailleurs.

## Prérequis (à faire *avant* d'en avoir besoin)
1. Sauvegardes activées : Admin → Configuration système → Sauvegardes → **Activé**.
2. Copiez régulièrement hors de la machine : le fichier le plus récent du volume `api_backups` (ou **Télécharger** depuis l'historique), votre `.env`, et le volume `api_uploads`.
3. Sachez où sont rangés votre `docker-compose.yml` et votre `.env`.

## Reconstruire sur une nouvelle machine
1. Installez Docker et placez votre `docker-compose.yml` et **le même `.env`** sur la nouvelle machine (en particulier la même `CONFIG_ENCRYPTION_KEY`).
2. Démarrez la pile : `docker compose up -d`. L'API crée une base vide.
3. Vérifiez que le fichier de sauvegarde est complet — cette commande n'affiche rien si le fichier est bon :
   ```bash
   gunzip -t glou-backup-XXXX.sql.gz
   ```
   > [!CAUTION]
   > Ne sautez pas cette étape. La commande suivante remplace toute la base ; si le fichier est tronqué (copie interrompue, disque plein), elle peut quand même se terminer « avec succès » sur une base vide ou partielle. Le bouton **Restaurer** de l'application détecte ce cas ; cette commande manuelle non.

   Puis restaurez-le :
   ```bash
   (printf 'DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n'; gunzip -c glou-backup-XXXX.sql.gz) \
     | docker compose exec -T db psql -U glou -d glou_db -v ON_ERROR_STOP=1 --single-transaction
   ```
   Une erreur SQL dans le fichier annule toute la restauration ; un fichier tronqué, c'est le rôle de la vérification `gunzip -t` ci-dessus.
4. Redémarrez l'API pour qu'elle applique les mises à jour de base postérieures à la sauvegarde : `docker compose restart api`.
5. Restaurez les photos dans le volume `api_uploads`, par exemple :
   ```bash
   docker run --rm -v <projet>_api_uploads:/data -v "$PWD":/backup alpine \
     sh -c 'cd /data && tar xzf /backup/uploads.tar.gz && chown -R 1001:1001 /data'
   ```
6. Vérifiez : connectez-vous, ouvrez une cave, envoyez un email de test (Admin → Configuration système → SMTP → test).

## Sauvegarder les photos
```bash
docker run --rm -v <projet>_api_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads.tar.gz -C /data .
```
Remplacez `<projet>` par le préfixe affiché par `docker volume ls` (en général le nom du dossier de votre fichier compose).

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| `gunzip -t` signale `unexpected end of file` ou `not in gzip format` | Le fichier est incomplet : recopiez-le, ou utilisez une sauvegarde plus ancienne. Ne le restaurez pas. |
| La restauration s'arrête avec des erreurs `already exists` | Le schéma n'a pas été réinitialisé : gardez la première ligne `printf` de la commande. |
| Tout est revenu mais les emails/Gotify échouent | `CONFIG_ENCRYPTION_KEY` diffère de celle de la sauvegarde. Utilisez le `.env` d'origine, ou ressaisissez les réglages comme décrit dans [Changer les secrets](./29-Rotation-Des-Secrets.md). |
| Les photos des bouteilles manquent | Le volume des photos n'a pas été restauré (il ne fait pas partie de la sauvegarde de la base). |
