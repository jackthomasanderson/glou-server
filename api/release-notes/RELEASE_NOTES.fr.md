# Notes de version de Glou

Ce que change chaque version, écrit pour les administrateurs et affiché dans la fenêtre « Quoi de neuf ? » après une mise
à jour (FEAT-115). `CHANGELOG.md` reste la référence technique. Chaque changement visible des utilisateurs ajoute une ligne
ici et la même dans `RELEASE_NOTES.en.md`, sous « À venir », dans la rubrique qui convient : Points d'attention, Sécurité,
Nouveautés, Améliorations, Corrections, Retiré. Les points d'attention disent seulement ce qu'il reste à faire ou à savoir
après la mise à jour, jamais ce qu'il faut faire avant. Une ligne de texte simple par note, sans Markdown. La publication
d'une version range les notes à venir sous le nouveau titre `## vYYYY.MM[.PATCH]`.

## À venir

### Points d'attention
- Les liens invités sans date d'expiration, ou qui ouvrent toutes les caves pour plus de 30 jours, expirent désormais 30 jours après cette mise à jour. Créez un nouveau lien limité aux bonnes caves ou collections pour un invité qui en a encore besoin.
- Si l'app web est jointe directement, sans proxy inverse devant elle, mettez TRUSTED_PROXY_HOPS=0 dans .env et redémarrez. Si votre fichier compose remplace la commande du service web, retirez ce remplacement.
- Analyses → Ajoutés, Supprimés et Restaurés comptent désormais les bouteilles et cigares à partir des nouveaux mouvements de stock et repartent de cette mise à jour.

### Sécurité
- Les alertes de sécurité (connexion d'un nouvel appareil, changement de mot de passe, d'e-mail, d'identifiant ou de double authentification…) ne peuvent plus être désactivées et arrivent toujours sur l'e-mail du compte quand le serveur sait envoyer des e-mails. Les avis sur les comptes des membres passent dans une nouvelle catégorie « Comptes des membres ».
- Changer d'identifiant, et créer un lien invité qui permet d'ouvrir, boire ou fumer, demandent désormais votre mot de passe.
- Activer la double authentification révoque les appareils approuvés avant.
- Les tentatives de connexion de chaque visiteur sont comptées sur sa propre adresse, et les mauvais mots de passe sont aussi limités par compte : un inconnu ne peut plus bloquer la connexion de tout le monde. Un navigateur depuis lequel le membre s'est déjà connecté se connecte même quand son compte est bloqué, avec ou sans double authentification, et le blocage apparaît dans le journal d'audit.

### Nouveautés
- Cette fenêtre « Quoi de neuf ? » : après chaque mise à jour, les administrateurs voient ce qui a changé. Elle se rouvre depuis Administration et depuis le bas du menu latéral.
- Le panneau d'un vin montre ses mouvements de stock : qui a ajouté, ouvert, bu, déplacé, changé le prix ou corrigé ses bouteilles, et quand.
- Administration → Gestion des membres : supprimer tout de suite le compte d'un membre, exporter ses données, et programmer ou annuler la suppression d'un compte, y compris pour un membre désactivé.

### Améliorations
- Les collections sont partagées par le foyer : chaque membre voit et remplit toutes les collections, et une collection reste quand son auteur s'en va.
- Profil → Connexion et sécurité réunit identifiant, e-mail, mot de passe, double authentification et verrouillage de l'app dans une seule carte. Le nom affiché et le nom personnalisé de l'app ont leurs propres champs.
- Supprimer un compte supprime désormais les données personnelles du membre (souhaits, objectifs, modèles, scans d'étiquettes) ; bouteilles, dégustations et collections restent au foyer.

### Corrections
- L'historique d'un vin et ses boutons Restaurer ne disparaissent plus après 90 jours : le nettoyage du journal d'audit garde l'historique de chaque vin et bouteille.
- Boire, déplacer ou compter une bouteille ne change plus la date à laquelle elle a été finie : les analyses de consommation et l'objectif du mois restent justes.
- Quand le serveur est injoignable, l'app n'attend plus indéfiniment, et pendant le redémarrage de la base elle dit que le serveur est momentanément indisponible au lieu d'une erreur.
- Les écrans se mettent à jour aussitôt après tout changement du stock (historique, objectif, suggestions, badges, statistiques, budget).
- Les lecteurs d'écran atteignent les listes déroulantes des fenêtres de formulaire et le menu d'actions des lignes d'un vin ; les textes secondaires sont plus lisibles.
