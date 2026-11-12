# Être alerté sur les événements de sécurité

## TL;DR
Glou vous notifie dès qu'un événement sensible survient sur votre compte : connexion depuis un nouvel appareil, changement de mot de passe, d'email ou de nom d'utilisateur, changements du 2FA, ou révocation d'une session. Ces alertes sont toujours activées : personne ne peut les désactiver, et elles arrivent toujours à l'email de votre compte dès que le serveur peut envoyer des emails.

## Prérequis
* Être connecté à votre compte.
* Pour l'email : l'administrateur a configuré l'email de l'instance (SMTP, voir [02-Configuration.md](./02-Configuration.md)). Votre propre interrupteur email dans **Profil → Notifications** ne compte pas pour les alertes de sécurité.
* Pour une copie Gotify : l'administrateur a configuré Gotify et vous avez activé le canal Gotify dans **Profil → Notifications**.

## Action

### Comprendre ce qui déclenche une alerte de sécurité
La catégorie de notification **Sécurité du compte** couvre ces événements, sans réglage individuel :
1. Connexion depuis un appareil ou une localisation jamais vus sur votre compte.
2. Changement de mot de passe (depuis votre profil ou par un lien de réinitialisation).
3. Changement d'adresse email : l'alerte part aussi à l'ancienne adresse, pour prévenir le titulaire même si la nouvelle adresse n'est pas la sienne.
4. Changement de nom d'utilisateur.
5. Activation ou désactivation de la Double Authentification, codes de secours régénérés, ou étape de double authentification bloquée après trop de codes erronés.
6. Demande de suppression du compte.
7. Révocation d'une session (la vôtre ou depuis le panneau des sessions, voir [11-Sessions-Appareils-De-Confiance.md](./11-Sessions-Appareils-De-Confiance.md)).

Les avis envoyés aux administrateurs sur les comptes **d'autres membres** (un membre a demandé la suppression de son compte, comptes supprimés après le délai de grâce) ne sont pas des alertes de sécurité sur votre propre compte : ils ont leur propre catégorie **Comptes des membres**, que les administrateurs peuvent désactiver comme les autres catégories.

Chaque notification inclut l'horodatage, l'appareil ou l'IP concerné, et un lien direct vers vos paramètres de sécurité (`/profile#security`) pour réagir.

### Pourquoi les alertes de sécurité ne peuvent pas être désactivées
Sans cela, quelqu'un qui vole une session ouverte pourrait d'abord couper ces alertes, puis changer votre mot de passe ou votre email sans que vous soyez prévenu. Donc :
1. Dans **Profil → Notifications**, la catégorie **Sécurité du compte** est cochée et verrouillée, avec une note qui explique pourquoi.
2. Le serveur garde la catégorie activée quoi qu'envoie un navigateur ou un script : la case verrouillée ne peut pas être contournée.
3. Les comptes qui avaient retiré la catégorie, ou désactivé le canal email, avant cette règle sont couverts aussi : rien à faire de votre côté.

### Où arrivent les alertes de sécurité
| Email de l'instance (SMTP) | Votre interrupteur email | Votre interrupteur Gotify | Ce que vous recevez |
| :--- | :--- | :--- | :--- |
| Configuré | Activé ou non | Désactivé | Un email à l'adresse de votre compte. |
| Configuré | Activé ou non | Activé | Un email à l'adresse de votre compte, et une copie Gotify. |
| Non configuré ou désactivé | — | Activé | Une copie Gotify seulement. |
| Non configuré ou désactivé | — | Désactivé, ou Gotify non configuré | Rien ne peut être envoyé : demandez à votre administrateur de configurer l'email. Les administrateurs voient toujours les connexions et les changements de compte dans le [journal d'audit](./10-Audit-Actions.md). |

Votre interrupteur email ne règle que les autres catégories (apogée, température, liste de souhaits, sauvegardes). Désactiver Gotify n'arrête que la copie Gotify.

> [!CAUTION]
> Les notifications de sécurité ignorent toujours vos heures silencieuses configurées : elles ne sont jamais retardées ni abandonnées la nuit.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Je n'ai pas reçu d'email pour un événement de sécurité** | Demandez à votre admin de vérifier la configuration email (SMTP) de l'instance : elle se règle au niveau de l'instance, voir [02-Configuration.md](./02-Configuration.md). Votre propre interrupteur email n'arrête pas les alertes de sécurité. Vérifiez aussi vos indésirables. |
| **Je ne peux pas décocher Sécurité du compte** | Comportement attendu : les alertes de sécurité ne peuvent pas être désactivées. La note sous la case l'indique. |
| **Je veux être notifié des changements de mot de passe mais pas des nouvelles connexions** | Pas possible : la catégorie sécurité est tout ou rien, et toujours activée. |
| **J'ai reçu une notification de sécurité alors que je n'ai rien fait** | Ouvrez le lien de la notification, vérifiez vos sessions actives ([11-Sessions-Appareils-De-Confiance.md](./11-Sessions-Appareils-De-Confiance.md)), et changez votre mot de passe si vous ne reconnaissez pas l'appareil ou la localisation. |
| **La notification est arrivée alors que j'ai configuré des heures silencieuses** | Comportement attendu. Les alertes de sécurité ignorent toujours les heures silencieuses par conception. |
