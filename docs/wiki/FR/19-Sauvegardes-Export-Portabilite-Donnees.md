# Planifier des sauvegardes, restaurer & exporter une copie filtrée

## TL;DR
Planifiez des sauvegardes de la base depuis l'Admin, restaurez-en une si nécessaire, exportez vos propres données (complètes ou filtrées par catégorie) depuis votre Profil, et vérifiez qui a eu accès à votre compte.

## Prérequis
* Compte administrateur pour planifier/restaurer des sauvegardes.
* Compte utilisateur classique pour exporter ses propres données.

## Action

### Planifier des sauvegardes automatiques (admin)
> [!IMPORTANT]
> Les sauvegardes sont **activées par défaut sur les nouvelles installations**. Une instance installée avant ce changement garde son réglage précédent, qui était **désactivé** : ouvrez le panneau ci-dessous et vérifiez que **Activé** est bien sur ON.

1. Allez dans **Admin → Configuration Système → Sauvegardes**.
2. Vérifiez que l'interrupteur **Activé** est bien activé.
3. Réglez la **Rétention** (jours de conservation des fichiers de sauvegarde, défaut `7`) et l'**Heure (UTC)** (heure de déclenchement quotidien, défaut `3`).
4. Cliquez sur **Enregistrer**.

> [!TIP]
> Le planificateur vérifie chaque heure et produit un dump si l'interrupteur est activé et que l'heure UTC courante correspond à l'heure configurée. Il s'exécute donc une fois par jour, et activer/désactiver **Activé** prend effet à la prochaine vérification horaire, sans redémarrage.
>
> Les sauvegardes manquées sont rattrapées. Si le conteneur était arrêté ou en redémarrage à l'heure configurée, la sauvegarde est faite à la vérification horaire suivante : dès que la dernière sauvegarde réussie a plus de 25 heures, une nouvelle est lancée.
>
> Les échecs sont signalés. Si une sauvegarde planifiée échoue (disque plein, base injoignable…), chaque administrateur est prévenu par ses canaux activés (email, Gotify/webhook), une seule fois par série d'échecs, puis de nouveau après 24 heures si l'échec persiste, pas toutes les heures. La catégorie s'appelle **Échec des sauvegardes (admin)** dans Profil → Notifications. Les anciens fichiers ne sont supprimés qu'après une sauvegarde *réussie* : un échec n'efface jamais le dernier bon dump.

### Lancer une sauvegarde immédiate
1. Dans le même onglet, cliquez sur **Exécuter maintenant**.
2. Une fois terminée, la nouvelle exécution apparaît en tête de l'historique avec sa taille de fichier.

### Restaurer une sauvegarde
1. Repérez l'exécution voulue dans l'historique des sauvegardes et cliquez sur **Restaurer**.

   > [!CAUTION]
   > La restauration est destructrice : elle écrase **toutes les données actuelles** avec le contenu de ce fichier de sauvegarde. La boîte de dialogue exige la saisie d'un mot de confirmation exact et de votre mot de passe avant que le bouton **Confirmer** ne devienne cliquable.

2. Confirmez. Une sauvegarde des données actuelles est d'abord prise et ajoutée à l'historique : pour annuler la restauration, restaurez cette sauvegarde. Si cette sauvegarde de sécurité échoue (disque plein…), rien n'est restauré et vos données restent intactes. La restauration est enregistrée dans le journal d'audit, qu'elle réussisse ou échoue.
3. La restauration est tout ou rien : si le fichier de sauvegarde est endommagé ou incomplet, elle échoue et vos données actuelles restent intactes. Après avoir restauré une sauvegarde faite par une **version plus ancienne** de Glou, redémarrez l'API (`docker compose restart api`) pour qu'elle applique les mises à jour de base de données postérieures à la sauvegarde.
4. Vous pouvez aussi **Télécharger** un fichier de sauvegarde directement depuis l'historique au lieu de le restaurer sur place.
5. Après une restauration, l'historique liste toujours tous les fichiers de sauvegarde de `./backups`, y compris ceux plus récents que la sauvegarde restaurée. Un fichier de sauvegarde copié à la main dans `./backups` (par exemple pour reprendre sur une nouvelle machine) apparaît dans l'historique après un redémarrage de l'API (`docker compose restart api`) ; il peut alors être restauré ou téléchargé comme les autres. Gardez son nom d'origine (`glou-backup-<date>.sql.gz`) : la date affichée en est tirée, alors qu'un fichier renommé est daté de sa dernière modification. Un fichier endommagé ou incomplet n'est pas listé (les logs de l'API en donnent la raison).

### Exporter vos données (complètes ou filtrées par catégorie)
1. Allez dans **Profil → Données & Confidentialité (section RGPD)**.
2. Cliquez sur **Exporter** pour un export complet de vos données, ou sur **Filtrer** pour déployer un sélecteur de catégories et ne choisir que ce dont vous avez besoin : **inventaire**, **caves**, **collections**, **dégustations**, **activité**, **liste de souhaits**, **budgets**, **objectifs de consommation**, **inventaires physiques**, **relevés d'humidor**, **sessions**, **appareils de confiance**, **préférences de notification**, **historique de configuration**. Le fichier contient une clé `included` qui liste les catégories réellement exportées. L'activité exportée couvre tout ce que la fenêtre de rétention conserve encore (pas de plafond arbitraire). Les sessions et appareils de confiance n'apparaissent que sous forme de métadonnées descriptives (appareil, localisation approximative, dates) : le jeton qui les authentifie n'est jamais exporté, ni aucun autre secret (mot de passe, 2FA).
3. Cliquez sur **Exporter la sélection**. Le fichier se télécharge sous le nom `glou-export.json` : du JSON brut, lisible par n'importe quel éditeur de texte ou script.

### Sauvegardez aussi `.env`, séparément
Les dumps de base contiennent votre inventaire, vos dégustations, votre historique de configuration — mais `CONFIG_ENCRYPTION_KEY` (dans `.env`, jamais en base) est la seule clé qui déchiffre les secrets portés par un dump (mot de passe SMTP, URL Gotify/webhook, clés d'API). Restaurer un dump sur une instance dont le `.env` a une `CONFIG_ENCRYPTION_KEY` **différente** rend ces champs illisibles — Glou ne fait pas échouer la restauration, mais Administration → Configuration Système les affichera vides, et il faudra les ressaisir.

Sauvegardez `.env` là où vous gardez déjà vos secrets (gestionnaire de mots de passe, coffre chiffré) — pas dans le dossier `backups/` lui-même, qui est fait pour des dumps que votre outil de sauvegarde collecte selon son propre calendrier, pas pour un fichier qui change rarement et mérite plus de soin qu'un lot de dumps qui tourne.

### Où vivent réellement les sauvegardes, et la preuve qu'une restauration fonctionne
Les dumps atterrissent dans `./backups` sur l'**hôte**, monté en bind mount dans le conteneur (`docker-compose.yml`), et non dans un volume Docker nommé — l'outil de sauvegarde que vous faites déjà tourner sur l'hôte (`restic`, un snapshot NAS, `rsync` vers une autre machine…) les voit et les collecte de son côté, et une panne de disque n'emporte plus la base et ses sauvegardes ensemble.

Le bon fonctionnement d'une restauration n'est pas qu'affirmé ici : `e2e/tests/backup-restore.spec.ts` exécute un vrai cycle sauvegarde → création de données → restauration → vérification que les nouvelles données ont disparu et que la sauvegarde de sécurité et les sauvegardes plus récentes sont toujours listées, contre une instance réellement démarrée, à chaque exécution de la CI (job `e2e` de `.github/workflows/docker-publish.yml`) — une preuve vérifiée en continu, plutôt qu'une note datée unique qui devient obsolète au premier changement.

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Les sauvegardes sont activées mais aucun fichier n'apparaît jamais** | Vérifiez la valeur **Heure (UTC)** par rapport à l'heure UTC actuelle : la tâche ne se déclenche que pendant cette heure précise, une fois activée. Ou cliquez sur **Exécuter maintenant** pour tester immédiatement. |
| **J'ai cliqué sur Restaurer et mes données sont différentes d'avant** | Normal : la restauration écrase toutes les données actuelles avec le contenu de la sauvegarde. Si c'était une erreur, restaurez la sauvegarde prise automatiquement juste avant la restauration : c'est l'entrée **Manuelle** la plus récente de l'historique. |
| **La restauration a été refusée : la sauvegarde prise avant la restauration a échoué** | Rien n'a été restauré. La sauvegarde en échec figure dans l'historique avec son erreur : corrigez la cause (le plus souvent l'espace disque ou les droits sur `./backups`), puis relancez la restauration. |
| **Mon fichier d'export ne contient qu'une partie de mes données** | Vous avez utilisé **Filtrer** et sélectionné seulement certaines catégories. Utilisez le bouton **Exporter** simple pour un export complet. |
| **Où sont réellement stockés les fichiers de sauvegarde ?** | Dans `./backups` sur l'hôte (bind mount, voir plus haut) — pointez votre propre outil de sauvegarde vers ce dossier. |
| **Les champs SMTP/Gotify/clé d'API d'une sauvegarde restaurée sont vides** | Le dump a été pris (ou est restauré) sur une instance dont le `.env` a une `CONFIG_ENCRYPTION_KEY` différente de celle qui a chiffré ces champs. Ressaisissez-les, et gardez `CONFIG_ENCRYPTION_KEY` sauvegardée avec vos autres secrets — voir « Sauvegardez aussi `.env`, séparément » plus haut. |
