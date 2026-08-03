# Configurer la Rétention des Données & Forcer une Maintenance

## TL;DR
Définissez la durée de conservation des logs d'audit, des sessions expirées et des invitations/partages invités inutilisés avant leur suppression automatique par Glou, et déclenchez un nettoyage immédiat sans attendre la tâche nocturne.

## Prérequis
* Compte administrateur.
* Quelques sessions expirées, partages invités révoqués ou logs d'audit anciens pour observer un effet (une instance vide affichera simplement zéro suppression).

## Action

### Configurer les durées de rétention
1. Allez dans **Admin → Configuration Système → Rétention & Maintenance**.
2. Renseignez les trois champs (en jours, 1 à 3650) :
   - **Rétention des logs d'audit** — défaut `90`.
   - **Rétention des sessions** — défaut `30`. S'applique aux sessions expirées/révoquées et aux appareils de confiance.
   - **Rétention des invitations / partages invités** — défaut `30`. S'applique aux partages invités expirés ou révoqués.
3. Cliquez sur **Enregistrer**.

### Forcer une exécution immédiate
1. Dans le même onglet, cliquez sur **Exécuter maintenant**.
2. Confirmez dans la boîte de dialogue. Cela supprime immédiatement tout ce qui a déjà dépassé sa fenêtre de rétention — sans attendre la tâche planifiée.
3. La nouvelle entrée apparaît en tête de l'historique avec le déclencheur `manual`, sa durée et le nombre d'éléments supprimés.

### Lire l'historique des exécutions
`GET /api/admin/maintenance/runs` alimente la liste (50 entrées par défaut, 100 max). Chaque entrée affiche :
- **Déclencheur** : `scheduled` (automatique) ou `manual` (via Exécuter maintenant).
- **Succès ou échec**, avec le message d'erreur en cas d'échec.
- **Durée** en millisecondes et le détail de ce qui a été purgé (logs / sessions / partages invités).

> [!TIP]
> La tâche automatique s'exécute chaque jour à 03h00 heure serveur (`node-cron`), et se déclenche aussi une fois immédiatement au démarrage du serveur — un redéploiement ou un redémarrage de conteneur ne laisse donc pas de données obsolètes traîner jusqu'à 24h.

> [!CAUTION]
> Cet onglet ne supprime que des données **déjà expirées ou révoquées** (vieux logs, sessions mortes, invitations mortes). Ce n'est pas la même chose que l'action "Purger toutes les données" de la zone dangereuse, qui efface toutes les données métier (caves, bouteilles, dégustations) après saisie d'un mot de confirmation — les deux actions sont indépendantes.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Une exécution affiche un échec** | Ouvrez l'entrée pour lire le message d'erreur enregistré. La tâche ne fait jamais planter le serveur en cas d'échec — elle enregistre `success: false` et réessaie à la prochaine exécution planifiée. |
| **Mes logs d'audit ont disparu plus tôt que prévu** | Vérifiez la **rétention des logs d'audit** — les logs plus anciens que cette valeur sont supprimés définitivement à chaque exécution (planifiée ou manuelle), pas archivés ailleurs. |
| **Exécuter maintenant affiche "0 supprimé"** | Rien n'avait encore dépassé sa fenêtre de rétention. C'est normal sur une instance récente ou juste après une exécution précédente. |
| **J'ai baissé une valeur de rétention mais les anciennes données sont toujours là** | Le changement ne s'applique qu'à la prochaine exécution (planifiée ou manuelle). Cliquez sur **Exécuter maintenant** pour l'appliquer immédiatement. |
