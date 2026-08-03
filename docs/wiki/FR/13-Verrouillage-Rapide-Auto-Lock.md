# Configurer le Verrouillage Rapide & l'Auto-Lock

## TL;DR
Verrouillez l'application instantanément en un clic, ou laissez-la se verrouiller seule après une période d'inactivité — déverrouillez avec votre mot de passe ou un code PIN court, sans vous déconnecter.

## Prérequis
* Être connecté à votre compte.

## Action

### Configurer un code PIN (optionnel, mais nécessaire pour déverrouiller par PIN)
1. Allez dans **Profil → Sécurité**.
2. Cliquez sur **Définir un code PIN**, saisissez votre mot de passe pour confirmer, puis choisissez un PIN de 4 à 6 chiffres.
3. Pour le modifier ou le supprimer plus tard, utilisez **Modifier le code PIN** ou **Supprimer** dans le même panneau (la suppression exige aussi votre mot de passe).

### Configurer l'auto-lock
1. Dans le même panneau **Profil → Sécurité**, ouvrez le sélecteur **Délai d'auto-lock**.
2. Choisissez **Jamais**, **5 min**, **15 min** ou **30 min**. Il n'existe pas de délai personnalisé — choisissez l'option la plus proche.
3. L'application se verrouille automatiquement après ce délai sans activité souris, clavier, clic ou défilement.

### Verrouiller et déverrouiller
1. Cliquez sur l'**icône de cadenas** dans l'en-tête (à côté de la cloche de notifications) pour verrouiller l'application instantanément, à tout moment.
2. Un écran de verrouillage apparaît par-dessus l'application. Déverrouillez avec votre **mot de passe**, ou avec votre **code PIN** si vous en avez configuré un (l'onglet PIN n'apparaît que si un PIN est configuré).
3. Si vous avez oublié les deux, cliquez sur **Se déconnecter** depuis l'écran de verrouillage pour mettre fin à la session et vous reconnecter depuis zéro.

> [!TIP]
> Verrouiller l'application ne met **pas** fin à votre session côté serveur — votre connexion reste valide. Cela masque uniquement l'interface derrière un écran de verrouillage sur cet appareil. Utilisez [11-Sessions-Appareils-De-Confiance.md](./11-Sessions-Appareils-De-Confiance.md) si vous devez réellement mettre fin à une session à distance (ex. appareil perdu).

> [!CAUTION]
> L'état verrouillé est stocké au niveau de la session de l'onglet du navigateur (effacé quand vous fermez complètement le navigateur). Rafraîchir la page conserve le verrouillage, mais rouvrir l'application dans une nouvelle session de navigateur démarre déverrouillé — l'auto-lock ne protège pas un appareil resté connecté après un redémarrage du navigateur.

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **L'onglet PIN n'apparaît pas sur l'écran de verrouillage** | Aucun PIN n'a encore été configuré pour votre compte. Déverrouillez avec votre mot de passe, puis configurez-en un dans Profil → Sécurité pour la prochaine fois. |
| **Erreur "Trop de tentatives" au déverrouillage** | Les tentatives de déverrouillage sont limitées (10 essais par 15 minutes) pour empêcher le brute-force du PIN. Attendez 15 minutes ou déverrouillez avec votre mot de passe complet une fois la limite réinitialisée. |
| **L'auto-lock se déclenche alors que je lis activement (sans cliquer)** | L'auto-lock suit les mouvements de souris, clics, frappes clavier et défilement. Une lecture passive sans aucune de ces actions pendant tout le délai déclenchera quand même le verrouillage — faites défiler ou bougez la souris périodiquement, ou augmentez le délai. |
| **L'application est encore verrouillée après avoir fermé puis rouvert le navigateur** | Normal uniquement si le navigateur a restauré votre session/onglets précédents. Une session de navigateur neuve démarre déverrouillée. |
