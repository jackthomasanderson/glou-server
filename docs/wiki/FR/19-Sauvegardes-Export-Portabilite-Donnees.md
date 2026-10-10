# Planifier des Sauvegardes, Restaurer & Exporter une Copie Filtrée

## TL;DR
Activez les sauvegardes automatiques de la base depuis l'Admin, restaurez-en une en cas de problème, exportez vos propres données (complètes ou filtrées par catégorie) depuis votre Profil, et vérifiez qui a eu accès à votre compte.

## Prérequis
* Compte administrateur pour planifier/restaurer des sauvegardes.
* Compte utilisateur classique pour exporter ses propres données et consulter le panneau de transparence des accès.

## Action

### Planifier des sauvegardes automatiques (admin)
> [!IMPORTANT]
> Les sauvegardes sont **activées par défaut sur les nouvelles installations**. Une instance installée avant ce changement garde son réglage précédent, qui était **désactivé** : ouvrez le panneau ci-dessous et vérifiez que **Activé** est bien sur ON.

1. Allez dans **Admin → Configuration Système → Sauvegardes**.
2. Vérifiez que l'interrupteur **Activé** est bien activé.
3. Réglez la **Rétention** (jours de conservation des fichiers de sauvegarde — défaut `7`) et l'**Heure (UTC)** (heure de déclenchement quotidien — défaut `3`).
4. Cliquez sur **Enregistrer**.

> [!TIP]
> Le planificateur vérifie chaque heure et produit un dump si l'interrupteur est activé ET que l'heure UTC courante correspond à l'heure configurée — il s'exécute donc en pratique une fois par jour, et activer/désactiver **Activé** prend effet dès la prochaine vérification horaire, sans redémarrage.
>
> **Les sauvegardes manquées sont rattrapées.** Si le conteneur était arrêté ou en redémarrage à l'heure configurée, la sauvegarde est faite à la vérification horaire suivante : dès que la dernière sauvegarde réussie a plus de 25 heures, une nouvelle est lancée.
>
> **Les échecs sont signalés.** Si une sauvegarde planifiée échoue (disque plein, base injoignable…), chaque administrateur est prévenu par ses canaux activés (email, Gotify/webhook) — une seule fois par série d'échecs, puis de nouveau après 24 heures si l'échec persiste, pas toutes les heures. La catégorie s'appelle **Échec des sauvegardes (admin)** dans Profil → Notifications. Les anciens fichiers ne sont supprimés qu'après une sauvegarde **réussie** : un échec n'efface jamais le dernier bon dump.

### Lancer une sauvegarde immédiate
1. Dans le même onglet, cliquez sur **Exécuter maintenant**.
2. La nouvelle exécution apparaît en tête de l'historique avec sa taille de fichier, une fois terminée.

### Restaurer une sauvegarde
1. Repérez l'exécution voulue dans l'historique des sauvegardes et cliquez sur **Restaurer**.

   > [!CAUTION]
   > La restauration est destructrice : elle écrase **toutes les données actuelles** avec le contenu de ce fichier de sauvegarde. Aucun retour en arrière possible. La boîte de dialogue exige la saisie d'un mot de confirmation exact avant que le bouton **Confirmer** ne devienne cliquable — lisez-la attentivement avant de saisir.

2. Confirmez. La restauration est enregistrée dans le journal d'audit, qu'elle réussisse ou échoue.
3. La restauration est tout ou rien : si le fichier de sauvegarde est endommagé ou incomplet, elle échoue et vos données actuelles restent intactes. Après avoir restauré une sauvegarde faite par une **version plus ancienne** de Glou, redémarrez l'API (`docker compose restart api`) pour qu'elle applique les mises à jour de base de données postérieures à la sauvegarde.
4. Vous pouvez aussi **Télécharger** un fichier de sauvegarde directement depuis l'historique au lieu de le restaurer sur place.

### Exporter vos données (complètes ou filtrées par catégorie)
1. Allez dans **Profil → Données & Confidentialité (section RGPD)**.
2. Cliquez sur **Exporter** pour un export complet de vos données, ou sur **Filtrer** pour déployer un sélecteur de catégories et ne choisir que ce dont vous avez besoin : **inventaire**, **caves**, **collections**, **dégustations**, **activité**, **liste de souhaits**, **budgets**, **objectifs de consommation**, **inventaires physiques**, **relevés d'humidor**, **sessions**, **appareils de confiance**, **préférences de notification**, **historique de configuration**. Le fichier contient une clé `included` qui liste les catégories réellement exportées. L'activité exportée couvre tout ce que la fenêtre de rétention conserve encore (pas de plafond arbitraire). Les sessions et appareils de confiance n'apparaissent que sous forme de métadonnées descriptives (appareil, localisation approximative, dates) : le jeton qui les authentifie n'est jamais exporté, ni aucun autre secret (mot de passe, 2FA).
3. Cliquez sur **Exporter la sélection**. Le fichier se télécharge sous le nom `glou-export.json` — du JSON brut, lisible par n'importe quel éditeur de texte ou script.

### Consulter le panneau de transparence des accès
1. Sur votre page **Profil**, le panneau de transparence affiche deux listes :
   - **Sessions actives** — appareil, dernière activité, et un badge marquant votre session actuelle. Cliquez sur **Gérer** pour aller en révoquer une.
   - **Partages actifs** — chaque partage invité actif, son expiration (ou "sans expiration"), et s'il accorde un accès partiel en écriture. Cliquez sur **Gérer** pour aller en révoquer un.
2. Ce panneau est volontairement en lecture seule — la révocation effective se fait sur les panneaux dédiés Sessions et Partages Invités vers lesquels il renvoie, afin de garder un seul endroit qui exécute l'action.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Les sauvegardes sont activées mais aucun fichier n'apparaît jamais** | Vérifiez la valeur **Heure (UTC)** par rapport à l'heure UTC actuelle — la tâche ne se déclenche que pendant cette heure précise, une fois activée. Ou cliquez sur **Exécuter maintenant** pour tester le mécanisme immédiatement. |
| **J'ai cliqué sur Restaurer et mes données sont différentes d'avant** | C'est normal — la restauration écrase toutes les données actuelles avec le contenu de la sauvegarde. Si c'était une erreur, restaurez une sauvegarde plus récente (ou l'état d'avant-restauration si vous en avez pris une manuelle juste avant). |
| **Mon fichier d'export ne contient qu'une partie de mes données** | Vous avez utilisé **Filtrer** et sélectionné seulement certaines catégories. Utilisez le bouton **Exporter** simple pour un export complet. |
| **Où sont réellement stockés les fichiers de sauvegarde ?** | Dans le dossier `backups/` du conteneur de l'API. Si vous utilisez Docker et voulez que les sauvegardes survivent à une reconstruction du conteneur, montez ce dossier sur un volume persistant. |
| **Le panneau de transparence des accès affiche une session ou un partage que je ne reconnais pas** | Cliquez sur **Gérer** pour accéder au panneau complet et le révoquer immédiatement, puis changez votre mot de passe s'il s'agit d'une session inconnue. |
