# Téléphone perdu avec la double authentification active

## En bref
Connectez-vous avec l'un de vos **codes de secours**, puis réactivez la double authentification (2FA) avec votre nouveau téléphone. Plus aucun code de secours ? Demandez à un administrateur de **réinitialiser votre mot de passe** : cela désactive aussi votre 2FA. Si vous êtes le seul administrateur et que c'est vous qui êtes bloqué, lancez la commande en base de données en bas de cette page, sur la machine qui fait tourner Glou.

## Prérequis
* Le mot de passe de votre compte (ou un administrateur, voir plus bas).
* Pour le dernier cas seulement : un accès shell à la machine qui exécute `docker compose`.

## Prévenir : gardez vos codes de secours
Quand vous activez la 2FA, Glou affiche **10 codes de secours**, une seule fois. Chacun remplace une fois le code à 6 chiffres.
1. Cliquez sur **Copier les codes** et collez-les dans un gestionnaire de mots de passe, ou notez-les et gardez-les en lieu sûr.
2. Cochez **J'ai sauvegardé mes codes** : la fenêtre ne se ferme pas avant.
3. **Profil → Sécurité et authentification** indique combien de codes il reste (« 7 codes de secours restants »). Quand il en reste peu, cliquez sur **Générer de nouveaux codes**, saisissez votre mot de passe et un code de votre application (ou un code de secours) : vous obtenez 10 nouveaux codes, et les précédents ne fonctionnent plus.

## Téléphone perdu, codes de secours sous la main
1. Sur la page de connexion, saisissez votre identifiant et votre mot de passe.
2. À l'étape **Code d'authentification**, cliquez sur **Utiliser un code de secours** et saisissez l'un de vos codes.
3. Dans **Profil → Sessions actives**, cliquez sur **Déconnecter** sur la session du téléphone perdu (voir [Sessions](./11-Sessions-Appareils-De-Confiance.md)) : celui qui le trouve ne doit pas rester connecté.
4. Allez dans **Profil → Sécurité et authentification**, cliquez sur **Désactiver** (mot de passe + un autre code de secours), puis sur **Activer** et scannez le nouveau QR code avec votre nouveau téléphone. Vous obtenez 10 nouveaux codes de secours.
   Si vous venez de vous connecter avec votre dernier code, il n'en reste plus pour confirmer cette étape : demandez à un administrateur (section suivante).

## Téléphone perdu, aucun code de secours : demandez à un administrateur
1. L'administrateur ouvre **Administration → Gestion des membres** et clique sur **Réinitialiser le mot de passe** (icône de clé) sur votre ligne. La confirmation indique que votre 2FA sera désactivée, et demande **le mot de passe de l'administrateur lui-même**, plus un code de sa propre application si son compte a la 2FA . C'est le cas pour toute réinitialisation de mot de passe et pour tout passage d'un membre en administrateur : une session admin ouverte ne suffit pas.
2. Il vous transmet le mot de passe temporaire affiché une seule fois, par un moyen sûr (en personne, par téléphone).
3. Connectez-vous avec : aucun code n'est demandé. Choisissez un nouveau mot de passe, puis réactivez la 2FA depuis votre profil.

La réinitialisation déconnecte aussi toutes vos sessions et vos appareils de confiance, et elle est inscrite au journal d'audit (une confirmation refusée aussi). Un administrateur qui réinitialise **son propre** mot de passe garde sa 2FA.

## Seul administrateur, bloqué : commande en base de données
Personne ne peut réinitialiser votre compte depuis l'application : désactivez donc votre 2FA directement dans la base. Sur la machine qui fait tourner Glou, dans le dossier de votre `docker-compose.yml` :

1. Faites d'abord une sauvegarde si possible (**Administration → Configuration système → Données**, depuis une autre session admin ; sinon voir [Reprise après sinistre](./30-Reprise-Apres-Sinistre.md)).
2. Listez les comptes pour retrouver votre identifiant exact :
   ```bash
   docker compose exec db psql -U glou -d glou_db -c \
     'SELECT username, email, "isAdmin", "isTwoFactorEnabled" FROM "User" ORDER BY "createdAt";'
   ```
3. Désactivez la 2FA de cet identifiant (remplacez `alice`, gardez les apostrophes autour) :
   ```bash
   docker compose exec -T db psql -U glou -d glou_db -v ON_ERROR_STOP=1 <<'SQL'
   UPDATE "User"
      SET "isTwoFactorEnabled" = false,
          "twoFactorSecret" = NULL,
          "backupCodes" = '{}',
          "twoFactorFailedAttempts" = 0,
          "twoFactorLockedUntil" = NULL
    WHERE username = 'alice';
   UPDATE "trusted_devices" SET "revokedAt" = now()
    WHERE "userId" = (SELECT id FROM "User" WHERE username = 'alice') AND "revokedAt" IS NULL;
   UPDATE "sessions" SET "revokedAt" = now()
    WHERE "userId" = (SELECT id FROM "User" WHERE username = 'alice') AND "revokedAt" IS NULL;
   SQL
   ```
   psql répond `UPDATE 1` pour la première instruction (les deux suivantes comptent les appareils de confiance et sessions déconnectés, dont celle du téléphone perdu). `UPDATE 0` en premier signifie que l'identifiant est faux : rien n'a été modifié.
4. Connectez-vous avec votre mot de passe (aucun code n'est demandé), puis réactivez la 2FA depuis votre profil et sauvegardez les nouveaux codes de secours.

(Utilisez vos propres `DB_USER` / `DB_NAME` si vous les avez changés dans `.env`.) Cela ne retire que le second facteur : votre mot de passe reste le même, et si vous l'avez oublié aussi, utilisez **Mot de passe oublié ?** sur la page de connexion (nécessite l'envoi d'e-mails configuré sur l'instance).

## Dépannage

| Symptôme | Cause et solution |
|---|---|
| « Code de vérification incorrect » avec un code de secours | Chaque code ne sert qu'une fois ; il a peut-être déjà été utilisé. Vérifiez le nombre restant dans votre profil, essayez-en un autre. |
| « Trop de codes incorrects. La vérification est bloquée pendant 15 minutes. » | Trop de codes faux d'affilée : attendez 15 minutes, puis réessayez avec un code de secours. |
| Après la réinitialisation par l'admin, le code est encore demandé | L'administrateur a réinitialisé son propre compte (sa 2FA est conservée), ou votre Glou est plus ancien que cette page : mettez Glou à jour, ou utilisez la commande en base ci-dessus. |
| « Mot de passe actuel incorrect » dans la fenêtre de réinitialisation de l'administrateur | Elle demande le mot de passe (et le code) **de l'administrateur**, pas celui du membre. |
| `psql: error: ... role "glou" does not exist` | Vous avez changé `DB_USER` dans `.env` : mettez cette valeur après `-U`, et votre `DB_NAME` après `-d`. |
