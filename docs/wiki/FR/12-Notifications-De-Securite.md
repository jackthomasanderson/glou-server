# Être Alerté sur les Événements de Sécurité

## TL;DR
Glou vous notifie automatiquement dès qu'un événement sensible survient sur votre compte : connexion depuis un nouvel appareil, changement de mot de passe, activation/désactivation du 2FA, ou révocation d'une session.

## Prérequis
* Être connecté à votre compte.
* Au moins un canal de notification activé (in-app et/ou email) dans **Profil → Notifications**.

## Action

### Comprendre ce qui déclenche une alerte de sécurité
La catégorie de notification **Sécurité** couvre ces événements, sans réglage individuel — un seul interrupteur contrôle l'ensemble :
1. Connexion depuis un appareil ou une localisation jamais vus sur votre compte.
2. Changement de mot de passe.
3. Activation ou désactivation de la Double Authentification.
4. Révocation d'une session (la vôtre ou depuis le panneau des sessions, voir [11-Sessions-Appareils-De-Confiance.md](./11-Sessions-Appareils-De-Confiance.md)).

Chaque notification inclut l'horodatage, l'appareil ou l'IP concerné, et un lien direct vers vos paramètres de sécurité (`/profile#security`) pour réagir immédiatement.

### Activer ou désactiver les notifications de sécurité
1. Allez dans **Profil → Notifications**.
2. Repérez la puce de catégorie **Sécurité** et cliquez dessus pour l'activer ou la désactiver.
3. Choisissez votre/vos canal/canaux de diffusion (in-app, email) via les interrupteurs de canal du même panneau.

> [!CAUTION]
> Les notifications de sécurité ignorent toujours vos heures silencieuses configurées. Un compte compromis ne doit pas attendre le matin — vous ne pouvez pas mettre cette catégorie en sourdine pendant les heures silencieuses, seulement la désactiver entièrement.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Je n'ai pas reçu d'email pour un événement de sécurité** | Vérifiez que le canal **email** est activé dans Profil → Notifications, et que la configuration SMTP de l'instance est active (demandez à votre admin — c'est réglé au niveau de l'instance, voir [02-Configuration.md](./02-Configuration.md)). |
| **Je veux être notifié des changements de mot de passe mais pas des nouvelles connexions** | Pas possible actuellement — la catégorie Sécurité est tout ou rien. La désactiver arrête les cinq types d'événements listés ci-dessus. |
| **J'ai reçu une notification de sécurité alors que je n'ai rien fait** | Traitez-la comme un signal réel. Ouvrez le lien de la notification, vérifiez vos sessions actives ([11-Sessions-Appareils-De-Confiance.md](./11-Sessions-Appareils-De-Confiance.md)), et changez votre mot de passe si vous ne reconnaissez pas l'appareil ou la localisation. |
| **La notification est arrivée alors que j'ai configuré des heures silencieuses** | Comportement attendu. Les alertes de sécurité ignorent toujours les heures silencieuses par conception. |
