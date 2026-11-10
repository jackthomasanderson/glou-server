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

1. Allez dans **Admin → Configuration Système → Données**.
2. Vérifiez que l'interrupteur **Activé** est bien activé.
3. Réglez la **Rétention** (jours de conservation des fichiers de sauvegarde, défaut `7`) et l'**Heure d'exécution** (heure de déclenchement quotidien, défaut `03:00`, dans le fuseau horaire du serveur `TZ`, affiché sous le champ).
4. Cliquez sur **Enregistrer**. Couper les sauvegardes, ou garder leurs fichiers moins de jours qu'avant, se confirme avec votre mot de passe, plus votre code si votre compte a la double authentification.

> [!TIP]
> Le planificateur vérifie chaque heure et produit un dump si l'interrupteur est activé et que l'heure courante, dans le fuseau horaire du serveur, correspond à l'heure configurée. Il s'exécute donc une fois par jour, et activer/désactiver **Activé** prend effet à la prochaine vérification horaire, sans redémarrage.
>
> Les sauvegardes manquées sont rattrapées. Si le conteneur était arrêté ou en redémarrage à l'heure configurée, la sauvegarde est faite à la vérification horaire suivante : dès que la dernière sauvegarde réussie a plus de 25 heures, une nouvelle est lancée.
>
> Les échecs sont signalés. Tant que la dernière sauvegarde a échoué (disque plein, base injoignable…), ou que la dernière réussie date de plus de 48 heures alors que les sauvegardes sont activées, chaque administrateur voit un bandeau rouge en haut de chaque page, avec un lien vers **Admin → Configuration Système → Données**. Il ne demande ni e-mail ni Gotify, et disparaît dès qu'une sauvegarde réussit. Les membres ne le voient jamais. Les administrateurs qui ont activé l'e-mail ou Gotify sont aussi prévenus par ce canal, une seule fois par série d'échecs, puis de nouveau après 24 heures si l'échec persiste, pas toutes les heures : la catégorie s'appelle **Échec des sauvegardes (admin)** dans Profil → Notifications. Les anciens fichiers ne sont supprimés qu'après une sauvegarde *réussie* : un échec n'efface jamais le dernier bon dump.

### Lancer une sauvegarde immédiate
1. Dans le même onglet, cliquez sur **Sauvegarder maintenant**.
2. Une fois terminée, la nouvelle exécution apparaît en tête de l'historique avec sa taille de fichier.

### Restaurer une sauvegarde
1. Repérez l'exécution voulue dans l'historique des sauvegardes et cliquez sur **Restaurer**.

   > [!CAUTION]
   > La restauration est destructrice : elle écrase **toutes les données actuelles** avec le contenu de ce fichier de sauvegarde. La boîte de dialogue exige la saisie d'un mot de confirmation exact ; vous confirmez ensuite avec votre mot de passe, et un code de votre application d'authentification (ou un code de secours) si votre compte a la double authentification.

2. Confirmez. Une sauvegarde des données actuelles est d'abord prise et ajoutée à l'historique : pour annuler la restauration, restaurez cette sauvegarde. Si cette sauvegarde de sécurité échoue (disque plein…), rien n'est restauré et vos données restent intactes. La restauration est enregistrée dans le journal d'audit, qu'elle réussisse ou échoue.
3. La restauration est tout ou rien : si le fichier de sauvegarde est endommagé ou incomplet, elle échoue et vos données actuelles restent intactes. Une sauvegarde faite par une **autre version** de Glou est refusée ici, et rien n'est restauré : une plus ancienne (comme le fichier `glou-backup-before-migration-…` pris avant une mise à jour) ou une plus récente. Pour revenir à l'ancienne version avec ses données, suivez [Revenir en arrière](./31-Mises-A-Jour-Et-Retour-Arriere.md#revenir-en-arrière). Pour rester sur la version actuelle avec les données de cette sauvegarde, restaurez-la avec la commande de l'étape 4 de [Reprise après sinistre](./30-Reprise-Apres-Sinistre.md), puis redémarrez l'API (`docker compose restart api`) : Glou sauvegarde les données, puis les met à jour.
4. Vous pouvez aussi **Télécharger** un fichier de sauvegarde directement depuis l'historique au lieu de le restaurer sur place. La confirmation est la même : votre mot de passe, et votre code si votre compte a la double authentification. Une session d'administrateur ouverte ne suffit ni pour télécharger, ni pour restaurer, ni pour purger.
5. Après une restauration, l'historique liste toujours tous les fichiers de sauvegarde de `./backups`, y compris ceux plus récents que la sauvegarde restaurée. Un fichier de sauvegarde copié à la main dans `./backups` (par exemple pour reprendre sur une nouvelle machine) apparaît dans l'historique après un redémarrage de l'API (`docker compose restart api`) ; il peut alors être restauré ou téléchargé comme les autres. Gardez son nom d'origine (`glou-backup-<date>.sql.gz`) : la date affichée en est tirée, alors qu'un fichier renommé est daté de sa dernière modification. Un fichier endommagé ou incomplet n'est pas listé (les logs de l'API en donnent la raison).

### Exporter vos données (complètes ou filtrées par catégorie)
1. Allez dans **Profil → Données & Confidentialité (section RGPD)**.
2. Cliquez sur **Exporter** pour un export complet de vos données, ou sur **Filtrer** pour déployer un sélecteur de catégories et ne choisir que ce dont vous avez besoin : **inventaire**, **caves**, **collections**, **dégustations**, **activité**, **liste de souhaits**, **budgets**, **objectifs de consommation**, **comptages**, **relevés d'humidor**, **sessions**, **appareils de confiance**, **préférences de notification**, **historique de configuration**. Le fichier contient une clé `included` qui liste les catégories réellement exportées. L'activité exportée couvre tout ce que la fenêtre de rétention conserve encore (pas de plafond arbitraire). Les sessions et appareils de confiance n'apparaissent que sous forme de métadonnées descriptives (appareil, localisation approximative, dates) : le jeton qui les authentifie n'est jamais exporté, ni aucun autre secret (mot de passe, 2FA).
3. Cliquez sur **Exporter la sélection**. Le fichier se télécharge sous le nom `glou-export.json` : du JSON brut, lisible par n'importe quel éditeur de texte ou script.

### Exporter votre cave en CSV
Dans **Profil → Données & Confidentialité**, **Exporter en CSV** télécharge un tableau de votre cave que vous ouvrez dans un tableur et que l'[import de fichier](./17-Assistant-Onboarding.md#importer-un-fichier-csv) relit tel quel (réimportable sans perte d'un groupe de bouteilles).
* **Ce qu'il contient** : **une ligne par ligne de bouteilles** en cave (avec sa quantité), plus une ligne par bouteille ou boîte **entamée** ; la cave, le prix et la date d'achat, la contenance (ou la vitole et le format de boîte pour un cigare), le niveau et la date d'ouverture, le lieu d'achat, l'emplacement, la valeur estimée, « À vérifier », et la description du vin (couleur, appellation, cépages, étiquettes, notes, fenêtre de dégustation, champs spiritueux et cigares…).
* **Langue** : en français, en-têtes français, séparateur `;` et virgule décimale (un tableur français l'ouvre directement, avec les accents) ; en anglais, en-têtes anglais, `,` et point. L'import lit les deux.
* **Ce qu'il ne contient pas** : les photos, les dégustations, l'historique, les alertes et rappels, les cases du plan de cave, et les bouteilles **bues, sorties ou à la corbeille** : tout cela n'est que dans l'export JSON complet ci-dessus. Les cellules de formule d'un tableur sont neutralisées, et l'import retire cette marque.
* **Limites de la réimportation** : un `|` dans une étiquette ou un cépage la scinde en deux ; une date d'achat vide est réimportée à la date du jour ; l'import prend **500 lignes** à la fois (un avertissement s'affiche au-delà, avec la marche à suivre pour le 2e morceau) ; la description d'un vin déjà connu n'est jamais modifiée par l'import.
* Une réimportation dans la même cave : choisissez **Ignorer (déjà comptées)** pour les vins déjà en cave (choix par défaut), sinon les bouteilles seraient comptées deux fois.

### Sauvegardez aussi `.env`, séparément
Les dumps de base contiennent votre inventaire, vos dégustations, votre historique de configuration — mais `CONFIG_ENCRYPTION_KEY` (dans `.env`, jamais en base) est la seule clé qui déchiffre les secrets portés par un dump (mot de passe SMTP, jeton d'application Gotify, clés d'API, et le secret de double authentification de chaque membre). Restaurer un dump sur une instance dont le `.env` a une `CONFIG_ENCRYPTION_KEY` **différente** rend ces champs illisibles — Glou ne fait pas échouer la restauration, mais Administration → Configuration Système les affichera vides, et il faudra les ressaisir, et les codes des applications d'authentification sont refusés : chaque membre se connecte avec un de ses codes de secours, puis désactive et réactive la double authentification (voir [Téléphone perdu](./32-Telephone-Perdu-2FA.md)).

Comme les secrets de double authentification sont chiffrés, un dump seul ne donne plus à personne les codes des applications d'authentification de vos membres — tant que `CONFIG_ENCRYPTION_KEY` n'est pas rangée avec lui. Les secrets enregistrés avant cette version sont chiffrés au démarrage de l'API, avant chaque sauvegarde et après une restauration.

> [!WARNING]
> Les sauvegardes prises **avant** cette version contiennent encore les secrets de double authentification en clair. Supprimez les copies que votre outil de sauvegarde garde ailleurs (restic, NAS, autre machine…), ou faites remettre en place la double authentification à chaque membre qui l'utilise (la désactiver, puis la réactiver, dans **Profil → Sécurité & Authentification**) : les anciens secrets ne donnent alors plus aucun code valide.

Sauvegardez `.env` là où vous gardez déjà vos secrets (gestionnaire de mots de passe, coffre chiffré) — ni dans le dossier `backups/` lui-même, ni sur le stockage où votre outil copie `backups/`, qui est fait pour des dumps que votre outil de sauvegarde collecte selon son propre calendrier, pas pour un fichier qui change rarement et mérite plus de soin qu'un lot de dumps qui tourne.

### Où vivent réellement les sauvegardes, et la preuve qu'une restauration fonctionne
Les dumps atterrissent dans `./backups` sur l'**hôte**, monté en bind mount dans le conteneur (`docker-compose.yml`), et non dans un volume Docker nommé — l'outil de sauvegarde que vous faites déjà tourner sur l'hôte (`restic`, un snapshot NAS, `rsync` vers une autre machine…) les voit et les collecte de son côté, et une panne de disque n'emporte plus la base et ses sauvegardes ensemble.

Le bon fonctionnement d'une restauration n'est pas qu'affirmé ici : `e2e/tests/backup-restore.spec.ts` exécute un vrai cycle sauvegarde → création de données → restauration → vérification que les nouvelles données ont disparu et que la sauvegarde de sécurité et les sauvegardes plus récentes sont toujours listées, contre une instance réellement démarrée, à chaque exécution de la CI (job `e2e` de `.github/workflows/docker-publish.yml`) — une preuve vérifiée en continu, plutôt qu'une note datée unique qui devient obsolète au premier changement.

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Les sauvegardes sont activées mais aucun fichier n'apparaît jamais** | Vérifiez la valeur **Heure d'exécution** par rapport à l'heure actuelle du fuseau du serveur (affiché sous le champ) : la tâche ne se déclenche que pendant cette heure précise, une fois activée. Ou cliquez sur **Sauvegarder maintenant** pour tester immédiatement. |
| **J'ai cliqué sur Restaurer et mes données sont différentes d'avant** | Normal : la restauration écrase toutes les données actuelles avec le contenu de la sauvegarde. Si c'était une erreur, restaurez la sauvegarde prise automatiquement juste avant la restauration : c'est l'entrée **Manuelle** la plus récente de l'historique. |
| **La restauration a été refusée : la sauvegarde prise avant la restauration a échoué** | Rien n'a été restauré. La sauvegarde en échec figure dans l'historique avec son erreur : corrigez la cause (le plus souvent l'espace disque ou les droits sur `./backups`), puis relancez la restauration. |
| **Mon fichier d'export ne contient qu'une partie de mes données** | Vous avez utilisé **Filtrer** et sélectionné seulement certaines catégories. Utilisez le bouton **Exporter** simple pour un export complet. |
| **Où sont réellement stockés les fichiers de sauvegarde ?** | Dans `./backups` sur l'hôte (bind mount, voir plus haut) — pointez votre propre outil de sauvegarde vers ce dossier. |
| **Après une restauration, les codes des applications d'authentification sont refusés** | Même cause : une `CONFIG_ENCRYPTION_KEY` différente. Remettez l'ancienne clé dans `.env` et `docker compose up -d api` ; sinon chaque membre se connecte avec un code de secours et remet en place la double authentification ([Téléphone perdu](./32-Telephone-Perdu-2FA.md)). |
| **Les champs SMTP/Gotify/clé d'API d'une sauvegarde restaurée sont vides** | Le dump a été pris (ou est restauré) sur une instance dont le `.env` a une `CONFIG_ENCRYPTION_KEY` différente de celle qui a chiffré ces champs. Ressaisissez-les, et gardez `CONFIG_ENCRYPTION_KEY` sauvegardée avec vos autres secrets — voir « Sauvegardez aussi `.env`, séparément » plus haut. |
