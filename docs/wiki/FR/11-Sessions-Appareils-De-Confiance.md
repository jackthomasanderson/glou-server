# Gérer les sessions actives et les appareils de confiance

## TL;DR
Listez les appareils connectés à votre compte, déconnectez-en un à distance, et évitez la saisie du code 2FA pendant 30 jours sur les appareils marqués comme "de confiance".

## Prérequis
* Être connecté à votre compte.
* Avoir la Double Authentification (2FA) activée (voir [01-Authentification.md](./01-Authentification.md)) : sans elle, il n'y a pas de code à sauter et le bloc « Appareil de confiance » n'apparaît pas. La confiance ne fait que sauter la relance 2FA, elle ne remplace pas votre mot de passe.

> [!TIP]
> Vous avez perdu le téléphone qui vous donne vos codes 2FA ? Voir [Téléphone perdu avec la 2FA](./32-Telephone-Perdu-2FA.md).

## Action

### Consulter et révoquer une session
1. Allez dans **Profil** (avatar en haut à droite) et descendez jusqu'à la section **Sécurité**.
2. Le panneau **Sessions actives** liste tous les appareils actuellement connectés à votre compte : appareil/navigateur, localisation approximative, date de première connexion et dernière activité.
3. Votre session en cours porte le badge **"Session actuelle"** et ne peut pas être révoquée depuis cet écran.
4. Cliquez sur **Déconnecter** sur n'importe quelle autre session pour y mettre fin immédiatement. L'appareil visé est déconnecté à sa prochaine requête.

> [!CAUTION]
> Révoquer une session invalide immédiatement le jeton côté serveur, mais un navigateur qui a déjà la page ouverte peut continuer d'afficher des données obsolètes jusqu'à sa prochaine requête. Si vous suspectez une compromission de votre compte, changez aussi votre mot de passe (voir [01-Authentification.md](./01-Authentification.md)).

### Faire confiance à l'appareil actuel
1. Dans **Profil**, carte **Connexion et sécurité**, le bloc **Appareil de confiance** (sous la double authentification) dit si l'appareil que vous utilisez est de confiance, et jusqu'à quand.
2. S'il ne l'est pas, cliquez sur **Faire confiance à cet appareil**, puis confirmez avec votre mot de passe et un code de double authentification. Pendant les **30 jours** suivants, cet appareil n'exigera plus le code 2FA à la connexion (votre mot de passe reste requis).
3. S'il l'est, le bloc affiche « de confiance jusqu'au … » et un seul bouton, **Ne plus faire confiance**. Le code 2FA vous sera redemandé à la prochaine connexion depuis cet appareil.

> [!TIP]
> La confiance est révoquée si le système détecte une connexion depuis un pays différent de celui enregistré lors de l'activation de la confiance. Le code 2FA vous sera alors redemandé : comportement attendu.

## Le "Pare-feu" (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Ma liste de sessions ne montre que quelques entrées, je m'attendais à voir d'anciennes connexions** | Seules les sessions actives (non expirées, non révoquées) sont listées. Il n'existe pas d'historique des sessions passées. |
| **"Faire confiance à cet appareil" n'empêche pas la demande 2FA** | La confiance ne s'applique qu'à la combinaison appareil/navigateur sur laquelle vous avez cliqué. Un autre navigateur ou une fenêtre de navigation privée est traité comme un nouvel appareil, non fiable. |
| **Le code 2FA m'a été redemandé subitement alors que j'avais fait confiance à mon appareil** | Votre connexion a été détectée depuis un pays différent de celui enregistré, ou la période de confiance de 30 jours a expiré. Authentifiez-vous normalement ; vous pouvez refaire confiance à l'appareil ensuite. |
| **Le nom d'appareil affiché est générique (ex. "Navigateur inconnu")** | Le libellé est déduit du user-agent du navigateur. Certains navigateurs ou extensions de confidentialité envoient un user-agent minimal, ce qui limite les détails d'identification. |
