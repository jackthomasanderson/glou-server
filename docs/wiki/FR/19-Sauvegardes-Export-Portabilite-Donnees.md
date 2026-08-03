# Planifier des Sauvegardes, Restaurer & Exporter une Copie Filtrée

## TL;DR
Activez les sauvegardes automatiques de la base depuis l'Admin, restaurez-en une en cas de problème, exportez vos propres données (complètes ou filtrées par catégorie) depuis votre Profil, et vérifiez qui a eu accès à votre compte.

## Prérequis
* Compte administrateur pour planifier/restaurer des sauvegardes.
* Compte utilisateur classique pour exporter ses propres données et consulter le panneau de transparence des accès.

## Action

### Planifier des sauvegardes automatiques (admin)
1. Allez dans **Admin → Configuration Système → Sauvegardes**.
2. Activez l'interrupteur **Activé**.
3. Réglez la **Rétention** (jours de conservation des fichiers de sauvegarde — défaut `7`) et l'**Heure (UTC)** (heure de déclenchement quotidien — défaut `3`).
4. Cliquez sur **Enregistrer**.

> [!TIP]
> Le planificateur vérifie chaque heure et ne produit un dump que si l'interrupteur est activé ET que l'heure UTC courante correspond à l'heure configurée — il s'exécute donc en pratique une fois par jour, et activer/désactiver **Activé** prend effet dès la prochaine vérification horaire, sans redémarrage.

### Lancer une sauvegarde immédiate
1. Dans le même onglet, cliquez sur **Exécuter maintenant**.
2. La nouvelle exécution apparaît en tête de l'historique avec sa taille de fichier, une fois terminée.

### Restaurer une sauvegarde
1. Repérez l'exécution voulue dans l'historique des sauvegardes et cliquez sur **Restaurer**.

   > [!CAUTION]
   > La restauration est destructrice : elle écrase **toutes les données actuelles** avec le contenu de ce fichier de sauvegarde. Aucun retour en arrière possible. La boîte de dialogue exige la saisie d'un mot de confirmation exact avant que le bouton **Confirmer** ne devienne cliquable — lisez-la attentivement avant de saisir.

2. Confirmez. La restauration est enregistrée dans le journal d'audit, qu'elle réussisse ou échoue.
3. Vous pouvez aussi **Télécharger** un fichier de sauvegarde directement depuis l'historique au lieu de le restaurer sur place.

### Exporter vos données (complètes ou filtrées par catégorie)
1. Allez dans **Profil → Données & Confidentialité (section RGPD)**.
2. Cliquez sur **Exporter** pour un export complet de vos données, ou sur **Filtrer** pour déployer un sélecteur de catégories et ne choisir que ce dont vous avez besoin : **inventaire**, **caves**, **collections**, **dégustations**, **activité**.
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
