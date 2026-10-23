# Ajouter une bouteille en photographiant son étiquette

## TL;DR
Le bouton « Scanner une étiquette » ouvre l'appareil photo, envoie la photo à un modèle de vision léger auto-hébergé (Ollama + moondream) qui pré-remplit nom, producteur, catégorie et millésime, à valider en 3 actions maximum.

## Prérequis
* Le scan d'étiquette est **optionnel et désactivé par défaut** (~9 Go de disque et ~3 Go de RAM). Activez-le avec `docker compose --profile scan up -d` : cela démarre le service `ollama` et le service ponctuel `ollama-pull`, qui télécharge le modèle `moondream` (~1,7 Go) au premier démarrage. Sans le profil `scan`, le reste de l'application fonctionne normalement et tous les boutons de scan sont masqués (assistant de premier lancement, inventaire, formulaire d'ajout). Ils apparaissent dès que le service répond et que le modèle est téléchargé. **Admin → Configuration système → Intégrations** indique si le scan est actif.
* Aucune configuration côté client : le scan utilise la caméra ou la galerie de l'appareil.

## Action

1. Depuis l'inventaire, cliquez **Scanner une étiquette**.
2. Photographiez l'étiquette de la bouteille, du spiritueux ou de la boîte de cigares, avec un cadrage net et une luminosité correcte.
3. Patientez pendant l'analyse (« Analyse de l'étiquette en cours… ») : le traitement est asynchrone et peut prendre plusieurs dizaines de secondes sur un serveur sans GPU, le modèle tournant en CPU par défaut.
4. Vérifiez et corrigez les informations détectées (nom, producteur, millésime, catégorie, contenance). Tous les champs restent éditables avant validation.
5. Si le produit ressemble à un item déjà en stock, une alerte de doublon s'affiche (voir déduplication universelle) : choisissez d'incrémenter le stock existant ou de créer une nouvelle fiche.
6. Cliquez **Confirmer et ajouter**. L'item est créé immédiatement (pas de brouillon en attente) et ajouté au panier « À Ranger » de la session.
7. Cliquez **Scanner l'article suivant** pour enchaîner sans quitter l'appareil photo, pour tout un lot de bouteilles.
8. Cliquez **Terminer** pour clore la session. Le panier « À Ranger » conserve l'ordre de scan pour faciliter le rangement physique.

> [!TIP]
> Configurez un emplacement par défaut par catégorie (« Toujours ranger les [catégorie] scannés ici ») pour que chaque bouteille scannée soit affectée automatiquement à la bonne cave.

## Limites de reconnaissance

| Facteur | Impact |
| :--- | :--- |
| Luminosité / netteté de la photo | Une étiquette floue, mal éclairée ou partiellement déchirée réduit fortement la qualité de la reconnaissance. |
| Modèle utilisé | `moondream` est un modèle de vision léger (~1,8 milliard de paramètres) auto-hébergé, pas un service cloud spécialisé vin/spiritueux. Il lit le texte et la mise en page générale, mais peut se tromper sur des appellations rares ou des millésimes peu lisibles. Vérifiez les champs avant de confirmer. |
| Matériel serveur | Le traitement tourne en CPU par défaut (aucune configuration GPU prévue). Plusieurs dizaines de secondes par photo sont normales sur du matériel home-lab classique. |

## Le pare-feu (troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Pas de bouton « Scanner une étiquette »** | Le profil `scan` n'est pas démarré, ou le modèle est encore en téléchargement : lancez `docker compose --profile scan up -d` et attendez la fin de `ollama-pull`. **Admin → Configuration système → Intégrations** indique si le scan est actif. |
| **« Le service de reconnaissance d'étiquettes n'est pas disponible »** | Le service s'est arrêté après le chargement de la page. Redémarrez le profil `scan`. En attendant, **Saisir manuellement** ouvre le formulaire d'ajout sans quitter la session de scan. |
| **Le scan reste bloqué sur « Analyse en cours » très longtemps** | Au tout premier démarrage de l'instance, le modèle `moondream` (~1,7 Go) doit être téléchargé par le service `ollama-pull` avant que le scan ne fonctionne. Patientez quelques minutes puis réessayez. Sur du matériel modeste, un scan peut légitimement prendre plusieurs minutes. |
| **« L'analyse a pris trop de temps »** | Le modèle n'a pas répondu à temps (`OLLAMA_TIMEOUT_AFTER_<n>MS` dans le journal de l'API). L'attente est de 10 minutes par défaut ; augmentez-la avec `OLLAMA_TIMEOUT_MS` (millisecondes) dans `.env`, puis `docker compose up -d`. |
| **« Trop de scans en peu de temps »** | Chaque membre peut envoyer 10 photos par tranche de 10 minutes. Patientez quelques minutes. |
| **« Cette photo n'a pas pu être envoyée »** | La photo dépasse 10 Mo ou n'est ni en JPEG, ni en PNG, ni en WebP, ni en GIF. |
| **« L'analyse de l'étiquette a échoué pour une raison technique »** | Tout autre échec. Le journal de l'API (`[scan] Job … failed`) en donne la cause. |
| **Les informations détectées sont fausses ou incomplètes** | Attendu avec un modèle de vision léger : corrigez manuellement les champs avant de cliquer « Confirmer et ajouter ». Rien n'est jamais enregistré sans validation explicite de votre part. |
| **Doublon signalé alors que ce n'est pas le même produit** | La détection de doublon compare nom/producteur/millésime. Si deux bouteilles différentes ont des libellés très proches, choisissez de créer une nouvelle fiche plutôt que d'incrémenter le stock existant. |
