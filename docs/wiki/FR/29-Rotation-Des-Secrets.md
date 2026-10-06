# Changer les secrets (`JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`)

## En bref
Les deux secrets sont dans votre `.env`. Changer **`JWT_SECRET`** déconnecte tout le monde. Changer **`CONFIG_ENCRYPTION_KEY`** rend inutilisables le mot de passe SMTP, le jeton Gotify et les clés Vivino/Whiskybase enregistrés, tant que vous ne les avez pas ressaisis : ne la changez qu'avec la procédure ci-dessous, jamais en modifiant simplement `.env`.

## Prérequis
* Accès shell à la machine qui exécute `docker compose`.
* Une sauvegarde fraîche (Admin → Configuration système → Sauvegardes → **Lancer maintenant**) et une copie de votre `.env` actuel.

## Ce que protège chaque secret

| Secret | Sert à | Si vous le changez |
|---|---|---|
| `JWT_SECRET` | Signer les jetons de session et le cookie « appareil de confiance » | Toutes les sessions deviennent invalides : chacun doit se reconnecter, et les appareils de confiance redemandent leur code 2FA. Aucune donnée n'est perdue. |
| `CONFIG_ENCRYPTION_KEY` (64 caractères hexadécimaux) | Chiffrer, dans la base, le **mot de passe SMTP, le jeton Gotify, la clé Vivino et la clé Whiskybase** | Les valeurs enregistrées ne peuvent plus être déchiffrées : l'envoi d'emails et de notifications Gotify échoue (le journal de l'API affiche `Unsupported state or unable to authenticate data`). Les mots de passe et secrets 2FA ne sont **pas** concernés. |

Générez de nouvelles valeurs avec :
```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -hex 32      # CONFIG_ENCRYPTION_KEY (exactement 64 caractères hexadécimaux)
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

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| L'API s'arrête au démarrage avec une ligne `FATAL` qui cite `JWT_SECRET` ou `CONFIG_ENCRYPTION_KEY` | La valeur est absente, encore celle d'exemple de `.env.example`, ou (pour la clé) pas de 64 caractères hexadécimaux. Corrigez `.env`, puis `docker compose up -d api`. |
| Les emails s'arrêtent après un redémarrage et le journal de l'API affiche `Unsupported state or unable to authenticate data` | `CONFIG_ENCRYPTION_KEY` n'est pas celle avec laquelle les données ont été enregistrées (par exemple après une restauration sur une machine dont le `.env` diffère). Remettez l'ancienne clé, ou suivez l'étape 3 de « Changer `CONFIG_ENCRYPTION_KEY` » et ressaisissez les valeurs. |

> [!IMPORTANT]
> Gardez `.env` en lieu sûr **hors** de la machine (gestionnaire de mots de passe, copie chiffrée). Une sauvegarde de la base sans sa `CONFIG_ENCRYPTION_KEY` ne permet pas de retrouver les réglages chiffrés — voir [Reprise après sinistre](./30-Reprise-Apres-Sinistre.md).
