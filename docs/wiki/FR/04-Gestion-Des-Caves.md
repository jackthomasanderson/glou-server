# Gérer mes caves, mes vins et mes bouteilles

**TL;DR** : Organisez vos bouteilles par zone de stockage (vieillissement, service, vitrine).

## Prérequis
- Avoir un compte utilisateur actif.
- Être connecté à l'application.

## Étapes de gestion

1. **Accéder à l'onglet Caves** : Cliquez sur "Caves" dans la barre de navigation supérieure.
2. **Créer une cave** :
   - Cliquez sur le bouton "Ajouter une cave".
   - Saisissez un nom (ex: "Cave Enterrée").
   - Sélectionnez le type (Vieillissement, Armoire Climatisée, ou Étagère).
   - Validez avec "Ajouter".
3. **Assigner des bouteilles** :
   - Ouvrez **Vins**, **Bulles** ou **Spiritueux** dans la navigation.
   - Ajoutez ou modifiez une bouteille.
   - Sélectionnez la cave de destination dans le menu déroulant "Caves".
4. **Modifier ou supprimer** : Utilisez les icônes crayon (éditer) ou poubelle (supprimer) sur chaque carte de cave.

### Le plan de cave : une case par bouteille
Une cave dont le plan est configuré (colonnes × rangées) affiche une grille. Chaque bouteille y a **sa propre case** : une ligne de 6 bouteilles identiques peut occuper 6 cases, et une boîte de cigares occupe une case. Seul un groupe de **cigares à l'unité** tient dans **une** case pour tous ses cigares, avec un badge « ×4 ». Le compteur (« 6 / 9 occupés ») compte les cases.
- **Ranger une bouteille** : touchez une case vide. **Assigner une bouteille à la case C2·R3** liste les lignes qui ont encore des bouteilles non rangées, avec leur compte (« 2 rangées, 4 non rangées »). Une ligne dont toutes les bouteilles ont déjà leur case est refusée avec la raison : « Les 6 bouteilles de cette ligne sont déjà rangées. »
- **Toucher une case occupée** ouvre le vin sur sa ligne, avec la case en tête du tiroir (« Case C2·R3 ») et **Retirer de la case**. **J'en ouvre une** ou **J'en bois une** depuis là prend la bouteille de **cette** case, sans autre question : ouverte, elle garde sa case ; bue, elle la libère. Si la case touchée est celle de la bouteille entamée, **Finir l'entamée** vient en premier.
- **Déplacer** : glissez une bouteille sur une case vide ; sur une case occupée, les deux bouteilles échangent leurs cases.
- **Clavier** : placez le focus sur une case, puis `Entrée` ouvre le vin (ou, sur une case vide, l'assignation) et `Espace` saisit la bouteille. Déplacez-la avec les flèches, une case à la fois, puis rappuyez sur `Espace` pour la déposer. `Échap` annule. Chaque étape est annoncée aux lecteurs d'écran.
- Hors connexion, le plan se consulte seulement : ranger, déplacer ou retirer une bouteille attend le retour de la connexion.

## Un vin, ses lignes et ses bouteilles

**TL;DR** : Un vin = une carte dans la liste, quel que soit le nombre de bouteilles. Ses bouteilles identiques (même cave, même prix, même contenance, même date d'achat, toutes intactes) forment une **ligne** « ×4 ». Ouvrez la carte pour agir sur une ligne ou sur une seule bouteille.

### Lire la liste et les compteurs
- La carte indique le stock : « 5 pleines · 1 entamée (60 %) ». Pour les cigares : « 3 boîtes fermées · 1 entamée · 4 à l'unité ».
- Les chiffres comptent des **bouteilles** (ou des **cigares**), pas des enregistrements : « 142 bouteilles · 58 vins » sur Vins, « 23 bouteilles · 17 spiritueux » sur Spiritueux, « 34 bouteilles · 12 cuvées » sur Bulles, « 89 cigares · 12 références » sur Cigares, « 165 bouteilles · 89 cigares » sur l'accueil. La valeur et les dépenses suivent : prix et valeur estimée sont ceux d'**une** bouteille, multipliés par le nombre.
- Filtrée par cave, la carte indique « 2 ici · 9 en tout ».
- Un vin dont il ne reste aucune bouteille (tout bu, ou goûté ailleurs) est **caché** de la liste. Le filtre **Plus en cave** l'affiche (« Plus de bouteille » ; « Plus de cigare ») ; la recherche le retrouve toujours. **Ajouter des bouteilles** le remet en cave. Il garde ses dégustations et son historique.
- Dans le tiroir, une ligne dont des bouteilles sont rangées sur le plan dit où : « 4 rangées, 2 non rangées · C1·R1, C1·R2, … » (pour des cigares à l'unité : « Rangés en C1·R1 »). Rien n'est affiché pour une ligne sans case.

### J'en ouvre une, j'en bois une, j'en fume un
Dans le tiroir du vin, **J'en ouvre une** (bouton principal ; **J'en fume un** pour un cigare) et **J'en bois une** (bouton secondaire) agissent sur **une seule** bouteille : elle se détache de sa ligne (×4 devient ×3) et devient une bouteille à part, entamée ou bue. Une bouteille bue reste dans votre historique et vos dépenses. Pour une ligne d'une seule bouteille, c'est cette bouteille qui change d'état.
- Si plusieurs lignes peuvent servir, Glou demande **Quelles bouteilles ?** avec un choix déjà sélectionné : la cave que vous regardiez, sinon l'achat le plus ancien ; à égalité de date (ou sans date), la moins chère puis la ligne la plus nombreuse.
- Si la ligne a des bouteilles rangées sur le plan, Glou demande **De quelle case ?** : les cases de la ligne, plus **Non rangée** tant qu'il en reste une, présélectionnée dans ce cas (sinon rien n'est présélectionné : touchez la case de la bouteille). Une bouteille ouverte garde sa case, une bouteille bue libère la sienne. La question ne se pose pas pour une ligne d'une seule bouteille ni pour des cigares à l'unité (leur case reste au groupe jusqu'au dernier).
- Un message **« 1 bouteille ouverte · Annuler »** reste affiché 8 secondes : **Annuler** remet la bouteille avec les autres, dans sa case si elle est encore libre.
- Les gestes faits sans le plan sous les yeux (**Marquer comme bus** groupé, inventaire physique, invité) ne posent pas la question : Glou prend une bouteille non rangée d'abord, sinon celle de la case rangée le plus récemment, et l'historique dit quelle case a été libérée (« Case C2·R3 libérée »).
- Si une bouteille de ce vin est déjà entamée, Glou vous le rappelle : « Une bouteille est déjà entamée (60 %) » — **Finir l'entamée** ou **En ouvrir une nouvelle**. En marquant une bouteille comme bue : « C'est elle que vous avez finie ? » (Oui : l'entamée passe en bue ; Non : une bouteille pleine passe en bue). Le [plan de consommation](./22-Plan-De-Consommation.md) propose de finir l'entamée d'abord.
- Cigares : fumer le premier cigare d'une boîte fermée l'entame (« boîte entamée, 24 restants »). Avec une boîte entamée et des boîtes fermées, Glou demande « Dans la boîte entamée ou en ouvrir une nouvelle ? ». Un cigare à l'unité fumé reste dans l'historique comme une bouteille bue.

### Remettre une bouteille entamée
Dans le menu d'une bouteille entamée, **Annuler l'ouverture** (ou remettre son niveau à « Pleine ») la remet avec les autres : elle rejoint sa ligne d'origine (×5 devient ×6) si elle y est identique, sinon elle forme une ligne ×1. Si une dégustation avait été notée sur cette bouteille, Glou demande d'abord de la garder (elle reste alors sur le vin) ou non. Après **Ne pas la garder**, le message « Annuler » rouvre la bouteille mais ne rend pas la dégustation effacée.

### Actions sur une ligne
Le menu d'une ligne propose :
- **Déplacer** : « Combien déplacer ? » puis la cave. La ligne se scinde (Garage ×4, Cuisine ×2) ; une ligne qui devient identique à une autre la rejoint, cases comprises. Les bouteilles déplacées arrivent non rangées dans la nouvelle cave.
- **Changer le prix** : « Pour combien de bouteilles ? ». Le prix d'une partie seulement scinde la ligne. Les bouteilles qui changent de prix sont prises d'abord parmi les non rangées ; si cela ne suffit pas, Glou demande **Quelles cases passent au nouveau prix ?** : ces cases restent occupées et suivent la nouvelle ligne.
- **Corriger le nombre** (à la baisse, avec son motif) et **Modifier** (date d'achat, lieu, emplacement…) : voir [05-Ajout-Bouteille.md](./05-Ajout-Bouteille.md).
- **Mettre à la corbeille** : la ligne se restaure depuis la corbeille.
- Quand une correction, une sortie ou un déplacement laisse à la ligne moins de bouteilles qu'elle n'a de cases, Glou demande **Quelles cases libérer ?** sur un petit plan de la cave : touchez exactement le nombre de cases demandé. Les bouteilles non rangées partent d'abord, sans question.

La description du vin (nom, région, cépages, notes…) se modifie **une fois pour toutes ses bouteilles** depuis le bouton de modification du tiroir.

### Actions groupées sur des vins
Sélectionnez des vins puis **Déplacer**, **Marquer comme bus** ou **Mettre à la corbeille** : l'action s'applique à **toutes les bouteilles en cave** de ces vins, après un résumé (« 3 vins, 14 bouteilles »). Pour une partie d'un vin, ouvrez-le. **Marquer comme bus** demande combien pour chaque vin de plusieurs bouteilles (1 par défaut ; en commençant par l'entamée). Les modèles d'actions groupées qui modifiaient l'état (entamée, niveau, date d'ouverture) ont été supprimés à la mise à jour. Hors connexion, les actions groupées sont indisponibles.

### La corbeille
Mettre à la corbeille une ligne, des bouteilles (action groupée) ou un vin entier est **restaurable** depuis l'onglet **Corbeille** jusqu'à la fin du délai affiché (« N jours restants avant suppression définitive »). À la purge :
* si ce sont les **bouteilles** d'un vin qui partent, le vin reste « Plus en cave » **seulement s'il a des dégustations** ; sinon il disparaît aussi ;
* si c'est le **vin lui-même** que vous avez mis à la corbeille, il est effacé pour de bon, **dégustations comprises** (la fenêtre de confirmation le rappelle).
Corriger un nombre avec le motif « Erreur de saisie » n'envoie rien à la corbeille : les bouteilles disparaissent (voir [05-Ajout-Bouteille.md](./05-Ajout-Bouteille.md)).

## Suivi hygrométrique (cave Humidor)

**TL;DR** : Pour une cave de type "Humidor", saisissez manuellement vos relevés d'humidité pour suivre l'historique et être alerté si la dernière mesure sort de votre plage cible.

### Prérequis
- [Mode Expert](./27-Mode-Expert.md) activé sur votre profil. Le type de cave "Humidor" et son panneau de monitoring ne sont visibles que s'il est actif.

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
> **Aucun capteur physique n'est supporté.** Il n'existe à ce jour aucune intégration MQTT, webhook ou sonde connectée : chaque relevé doit être saisi manuellement, un par un, par un utilisateur. Le champ technique `source` d'un relevé peut valoir `manual` (tous les relevés créés depuis l'interface) ou `sensor` (réservé à un futur pont matériel, non développé). Le relevé automatique par sonde d'humidor n'existe pas dans l'application.

## Dépannage (Troubleshooting)

| Problème | Cause probable | Résolution |
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
> Des noms de caves explicites (ex: "Milli60 - Zone Basse") facilitent la recherche des bouteilles sur mobile.
