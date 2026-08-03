# Ajouter une Bouteille en Photographiant son Étiquette

## TL;DR
Le bouton « Scanner une étiquette » ouvre l'appareil photo, envoie la photo à un modèle de vision léger auto-hébergé (Ollama + moondream) qui pré-remplit nom, producteur, catégorie et millésime, à valider en 3 actions maximum.

## Prérequis
* Le service `ollama` doit tourner via Docker Compose, avec le modèle `moondream` téléchargé — automatique au premier démarrage via le service `ollama-pull` (~1,7 Go, voir Troubleshooting si le premier scan échoue).
* Aucune configuration côté client : le scan utilise la caméra ou la galerie de l'appareil.

## Action

1. Depuis l'inventaire, cliquez **Scanner une étiquette**.
2. Photographiez l'étiquette de la bouteille, du spiritueux ou de la boîte de cigares — cadrage net, luminosité correcte.
3. Patientez pendant l'analyse (« Analyse de l'étiquette en cours… ») : le traitement est asynchrone et peut prendre plusieurs dizaines de secondes sur un serveur sans GPU, le modèle tournant en CPU par défaut.
4. Vérifiez et corrigez les informations détectées (nom, producteur, millésime, catégorie, contenance) — tous les champs restent éditables avant validation.
5. Si le produit ressemble à un item déjà en stock, une alerte de doublon s'affiche (voir déduplication universelle) : choisissez d'incrémenter le stock existant ou de créer une nouvelle fiche.
6. Cliquez **Confirmer et ajouter** — l'item est créé immédiatement (pas de brouillon en attente) et ajouté au panier « À Ranger » de la session.
7. Cliquez **Scanner l'article suivant** pour enchaîner sans quitter l'appareil photo — répétez pour tout un lot de bouteilles.
8. Cliquez **Terminer** pour clore la session ; le panier « À Ranger » conserve l'ordre de scan pour faciliter le rangement physique.

> [!TIP]
> Configurez un emplacement par défaut par catégorie (« Toujours ranger les [catégorie] scannés ici ») pour que chaque bouteille scannée soit automatiquement affectée à la bonne cave, sans clic supplémentaire.

## Limites de reconnaissance

| Facteur | Impact |
| :--- | :--- |
| Luminosité / netteté de la photo | Déterminant direct : une étiquette floue, mal éclairée ou partiellement déchirée réduit fortement la qualité de la reconnaissance. |
| Modèle utilisé | `moondream` est un modèle de vision léger (~1,8 milliard de paramètres) auto-hébergé, pas un service cloud spécialisé vin/spiritueux — il lit le texte et la mise en page générale, mais peut se tromper sur des appellations rares ou des millésimes peu lisibles. Vérifiez systématiquement les champs avant de confirmer. |
| Matériel serveur | Le traitement tourne en CPU par défaut (aucune configuration GPU prévue) — plusieurs dizaines de secondes par photo sont normales sur du matériel home-lab classique. |

## Le Pare-feu (Troubleshooting)

| Erreur / Comportement | Solution |
| :--- | :--- |
| **Le scan reste bloqué sur « Analyse en cours » très longtemps** | Au tout premier démarrage de l'instance, le modèle `moondream` (~1,7 Go) doit être téléchargé par le service `ollama-pull` avant que le scan ne fonctionne — patientez quelques minutes puis réessayez. Sur du matériel modeste, un scan peut légitimement prendre jusqu'à 2 minutes (timeout serveur fixé à 120 s). |
| **« L'analyse de la photo a échoué »** | Réessayez avec une photo plus nette ou mieux éclairée — c'est le message générique renvoyé en cas d'échec du modèle ou de timeout. |
| **Les informations détectées sont fausses ou incomplètes** | Attendu avec un modèle de vision léger : corrigez manuellement les champs avant de cliquer « Confirmer et ajouter ». Rien n'est jamais enregistré sans validation explicite de votre part. |
| **Doublon signalé alors que ce n'est pas le même produit** | La détection de doublon compare nom/producteur/millésime — si deux bouteilles différentes ont des libellés très proches, choisissez de créer une nouvelle fiche plutôt que d'incrémenter le stock existant. |
