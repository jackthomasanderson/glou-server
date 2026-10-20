# Changer les secrets (`JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`, `DB_PASSWORD`)

## En bref
Les trois secrets sont dans votre `.env`. Changer **`JWT_SECRET`** déconnecte tout le monde. Changer **`CONFIG_ENCRYPTION_KEY`** rend inutilisables le mot de passe SMTP, le jeton Gotify et les clés Vivino/Whiskybase enregistrés, tant que vous ne les avez pas ressaisis : ne la changez qu'avec la procédure ci-dessous, jamais en modifiant simplement `.env`. Changer **`DB_PASSWORD`** dans `.env` seul ne fait **rien** sur une instance existante : Postgres ne lit cette valeur qu'à la toute première initialisation de son volume de données, il faut donc aussi changer le mot de passe du rôle directement dans Postgres.

> [!WARNING]
> Si votre instance tourne depuis avant l'existence de cette page, `docker-compose.yml` a pu démarrer avec un mot de passe de base de données de repli codé en dur (`glou_secret`) au lieu d'une valeur choisie par vous. Cette valeur est publique (elle figure dans l'historique git de Glou) et doit être considérée comme compromise. Changez `DB_PASSWORD` dès maintenant avec la procédure ci-dessous, même si rien ne semble anormal. Voir [`.env.example`](../../../.env.example) pour le détail de la suppression de ce repli.

## Prérequis
* Accès shell à la machine qui exécute `docker compose`.
* Une sauvegarde fraîche (Admin → Configuration système → Sauvegardes → **Lancer maintenant**) et une copie de votre `.env` actuel.

## Ce que protège chaque secret

| Secret | Sert à | Si vous le changez |
|---|---|---|
| `JWT_SECRET` | Signer les jetons de session et le cookie « appareil de confiance » | Toutes les sessions deviennent invalides : chacun doit se reconnecter, et les appareils de confiance redemandent leur code 2FA. Aucune donnée n'est perdue. |
| `CONFIG_ENCRYPTION_KEY` (64 caractères hexadécimaux) | Chiffrer, dans la base, le **mot de passe SMTP, le jeton Gotify, la clé Vivino et la clé Whiskybase** | Les valeurs enregistrées ne peuvent plus être déchiffrées : l'envoi d'emails et de notifications Gotify échoue (le journal de l'API affiche `Unsupported state or unable to authenticate data`). Les mots de passe et secrets 2FA ne sont **pas** concernés. |
| `DB_PASSWORD` | Authentifier l'API (et vous, via `psql`) auprès du rôle Postgres | Rien, tant que vous n'avez pas aussi changé le mot de passe du rôle dans Postgres (voir ci-dessous). Les deux doivent être changés ensemble. |

Générez de nouvelles valeurs avec :
```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -hex 32      # CONFIG_ENCRYPTION_KEY (exactement 64 caractères hexadécimaux)
openssl rand -base64 32   # DB_PASSWORD
```

## Changer `JWT_SECRET`
1. Modifiez `JWT_SECRET` dans `.env`.
2. Recréez l'API : `docker compose up -d api`.
3. Prévenez vos utilisateurs : ils devront se reconnecter.

## Changer `CONFIG_ENCRYPTION_KEY`
1. Notez le mot de passe SMTP, le jeton Gotify et les clés d'API que vous utilisez (Admin → Configuration système). Ils ne peuvent pas être rechiffrés automatiquement.
2. Modifiez `CONFIG_ENCRYPTION_KEY` dans `.env`.
3. Effacez les valeurs chiffrées avec l'ancienne clé, puis recréez l'API :
   ```bash
   docker compose exec db psql -U glou -d glou_db -c \
     'UPDATE "SystemConfig" SET "smtpPassEnc"=NULL, "gotifyTokenEnc"=NULL, "vivinoKeyEnc"=NULL, "whiskybaseKeyEnc"=NULL;'
   docker compose up -d api
   ```
   (Utilisez vos propres `DB_USER` / `DB_NAME` si vous les avez changés.)
4. Ouvrez Admin → Configuration système, ressaisissez le mot de passe SMTP, le jeton Gotify et les clés, puis utilisez les boutons de **test**.

## Changer `DB_PASSWORD`
1. Générez un nouveau mot de passe (voir ci-dessus) et faites une sauvegarde fraîche.
2. Changez le mot de passe du rôle **dans** Postgres, avec le mot de passe encore configuré dans `.env` :
   ```bash
   docker compose exec db psql -U glou -d glou_db -c \
     "ALTER ROLE glou WITH PASSWORD '<nouveau mot de passe>';"
   ```
   (Utilisez votre propre `DB_USER` si vous l'avez changé.)
3. Mettez `DB_PASSWORD` à jour dans `.env` avec cette même nouvelle valeur.
4. Recréez l'API pour qu'elle prenne en compte la nouvelle `DATABASE_URL` : `docker compose up -d api`.

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| L'API s'arrête au démarrage avec une ligne `FATAL` qui cite `JWT_SECRET` ou `CONFIG_ENCRYPTION_KEY` | La valeur est absente, encore celle d'exemple de `.env.example`, ou (pour la clé) pas de 64 caractères hexadécimaux. Corrigez `.env`, puis `docker compose up -d api`. |
| Les emails s'arrêtent après un redémarrage et le journal de l'API affiche `Unsupported state or unable to authenticate data` | `CONFIG_ENCRYPTION_KEY` n'est pas celle avec laquelle les données ont été enregistrées (par exemple après une restauration sur une machine dont le `.env` diffère). Remettez l'ancienne clé, ou suivez l'étape 3 de « Changer `CONFIG_ENCRYPTION_KEY` » et ressaisissez les valeurs. |
| Le journal de l'API affiche `password authentication failed for user` après avoir modifié `DB_PASSWORD` | `.env` a été changé mais pas le mot de passe du rôle dans Postgres (ou l'inverse). Les deux doivent correspondre. Refaites l'étape 2 de « Changer `DB_PASSWORD` », ou remettez `DB_PASSWORD` à la valeur que Postgres a encore. |

> [!IMPORTANT]
> Gardez `.env` en lieu sûr **hors** de la machine (gestionnaire de mots de passe, copie chiffrée). Une sauvegarde de la base sans sa `CONFIG_ENCRYPTION_KEY` ne permet pas de retrouver les réglages chiffrés. Voir [Reprise après sinistre](./30-Reprise-Apres-Sinistre.md).
