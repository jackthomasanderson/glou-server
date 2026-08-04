# Gérer mes Caves à vin

**TL;DR** : Organisez vos bouteilles par zones de stockage (vieillissement, service, vitrine) pour un inventaire précis et localisé.

## Prérequis
- Avoir un compte utilisateur actif.
- Être connecté à l'application.

## Étapes de Gestion

1. **Accéder à l'onglet Caves** : Cliquez sur "Caves" dans la barre de navigation supérieure.
2. **Créer une cave** :
   - Cliquez sur le bouton "Ajouter une cave".
   - Saisissez un nom (ex: "Cave Enterrée").
   - Sélectionnez le type (Vieillissement, Armoire Climatisée, ou Étagère).
   - Validez avec "Ajouter".
3. **Assigner des bouteilles** :
   - Rendez-vous sur la page "Bouteilles".
   - Ajoutez ou modifiez une bouteille.
   - Sélectionnez la cave de destination dans le menu déroulant "Caves".
4. **Modifier ou Supprimer** : Utilisez les icônes crayon (éditer) ou poubelle (supprimer) sur chaque carte de cave.

## Suivi Hygrométrique (Cave Humidor)

**TL;DR** : Pour une cave de type "Humidor", saisissez manuellement vos relevés d'humidité pour suivre l'historique et être alerté si la dernière mesure sort de votre plage cible.

### Prérequis
- [Mode Expert](./27-Mode-Expert.md) activé sur votre profil — le type de cave "Humidor" et son panneau de monitoring ne sont visibles qu'à cette condition.

### Action

1. **Créer ou éditer une cave en type "Humidor (cigares)"** : dans le formulaire de cave, sélectionnez ce type (visible uniquement en mode expert).
2. **Définir la plage cible d'hygrométrie** (optionnel mais recommandé) : renseignez `Humidité min. (%)` et `Humidité max. (%)` (ex : 68-72%). Sans cette plage, aucune dérive ne peut être détectée (statut "Non configuré").
3. **Ouvrir la fiche de la cave** : le panneau "Monitoring hygrométrique" apparaît sous les informations de la cave.
4. **Ajouter un relevé** : en bas du panneau, saisissez l'`Humidité (%)` mesurée (obligatoire) et, si vous le souhaitez, la `Température (°C)` (informative uniquement, n'entre pas dans le calcul de dérive). Cliquez sur le bouton d'ajout.
5. **Lire le statut** : un badge indique `Dans la plage`, `Hors plage` ou `Non configuré`, calculé uniquement à partir de **votre dernier relevé** (pas d'historique de dérive, pas de moyenne).
6. **Consulter l'historique** : les relevés récents (jusqu'à 100, 30 par défaut) s'affichent sous forme de liste et d'un mini-graphique, du plus ancien au plus récent.

> [!TIP]
> Si le dernier relevé sort de la plage cible, une notification est envoyée dans la catégorie "Variations température/hygrométrie" (réglable dans Profil > Notifications), en plus du badge "Hors plage" sur le panneau.

> [!CAUTION]
> **Aucun capteur physique n'est supporté.** Il n'existe à ce jour aucune intégration MQTT, webhook ou sonde connectée : chaque relevé doit être saisi manuellement, un par un, par un utilisateur. Le champ technique `source` d'un relevé peut valoir `manual` (tous les relevés créés depuis l'interface) ou `sensor` (réservé pour un futur pont matériel — non développé). Si vous cherchez à brancher une sonde d'humidor pour un relevé automatique, cette fonctionnalité n'existe pas dans l'application.

## Dépannage (Troubleshooting)

| Problème | Cause Probable | Résolution |
| :--- | :--- | :--- |
| Ma cave n'apparaît pas dans la liste des bouteilles | Synchronisation de session | Rafraîchissez la page (F5). |
| Je ne peux pas supprimer une cave | Erreur de connexion | Vérifiez que vous êtes toujours connecté. La suppression d'une cave n'efface pas les bouteilles (elles deviennent "orphelines"). |
| Impossible d'enregistrer le nom | Validation | Le nom doit contenir au moins 1 caractère et moins de 200. |
| Le type "Humidor" n'apparaît pas dans la liste des types de cave | Mode Expert désactivé | Activez le [Mode Expert](./27-Mode-Expert.md) depuis votre profil. |
| Le panneau de monitoring hygrométrique n'apparaît pas sur la fiche de ma cave Humidor | Mode Expert désactivé, ou la cave n'est pas (ou plus) de type Humidor | Vérifiez le type de la cave et que le mode expert est actif. |
| Le statut affiche "Non configuré" alors que j'ai enregistré des relevés | Aucune plage cible définie sur la cave | Éditez la cave et renseignez `Humidité min.` et `Humidité max.`. |
| Mon relevé est rejeté (erreur `VALIDATION_ERROR`) | Humidité hors de 0-100%, ou température hors de -20°C à 60°C | Corrigez la valeur saisie ; ce sont les seules bornes acceptées par l'API. |
| J'attends qu'une sonde connectée envoie ses relevés automatiquement, rien ne se passe | Aucun support de sonde physique/MQTT n'existe dans l'application | Saisissez les relevés manuellement. Voir l'encadré ci-dessus. |

> [!TIP]
> Utilisez des noms explicites pour vos caves (ex: "Milli60 - Zone Basse") pour retrouver vos bouteilles plus rapidement sur mobile.
