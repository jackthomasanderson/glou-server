# Chercher un vin sur Vivino

## TL;DR
Une recherche optionnelle retrouve un vin sur Vivino à partir de son producteur, de son nom et de son millésime, et propose des valeurs pour les champs de la fiche : fenêtre de garde, cépages, degré et couleur. Elle renvoie aussi la note, la région et le prix Vivino, à afficher comme venant de Vivino. Elle est désactivée par défaut et, pour l'instant, accessible seulement par l'API : aucun écran ne l'utilise encore.

## Prérequis
* `VIVINO_ENABLED=true` dans `.env`, puis `docker compose up -d`.
* Le serveur peut joindre `https://www.vivino.com`.

> [!WARNING]
> Vivino n'a pas d'API publique. La recherche lit les pages web publiques que reçoit un navigateur, ce que les conditions d'utilisation de Vivino n'autorisent pas, et leur format peut changer sans prévenir : les recherches ne trouvent alors plus rien jusqu'à la mise à jour de l'analyseur. Quand la recherche est active, le producteur, le nom, le millésime et l'appellation de chaque vin recherché partent vers vivino.com.

## Fonctionnement
1. Un membre connecté appelle `GET /api/vivino/lookup` avec les champs de la fiche : `producer` (obligatoire), `name`, `vintage`, `color`, `category` (`wine` ou `sparkling`), `appellation`, `region`, `sugarLevel`. `GET /api/vivino/status` indique si la recherche est active.
2. Glou cherche sur Vivino, note chaque résultat sur le producteur, le nom du vin, l'appellation, la couleur et la douceur, puis ouvre les meilleurs (trois au plus) jusqu'à en trouver un qui correspond à la bouteille. Un vin d'une autre couleur du même producteur est refusé plutôt que renvoyé.
3. La réponse contient `match` (le vin Vivino : lien, note, région, prix, image) et `suggestions`, sous les noms des champs de la fiche : `color`, `grapeVarieties`, `alcoholDegree`, `peakMaturityFrom`, `peakMaturityTo`. Seules les valeurs acceptées par le formulaire de la fiche sont proposées.

La recherche n'écrit rien. Appliquer une suggestion, et laisser intacts les champs listés dans `lockedFields`, revient à l'appelant.

## Limites
* Les requêtes vers Vivino partent une par une, à 2 ou 3 secondes d'intervalle : une recherche prend quelques secondes, jusqu'à une vingtaine pour un cas difficile.
* Les réponses sont gardées en mémoire 30 jours (un vin introuvable, un jour) et sont perdues au redémarrage de l'API.
* Chaque membre peut lancer 30 recherches toutes les 10 minutes.
* Si Vivino répond *trop de requêtes* (403 ou 429), plus aucune requête ne part pendant 15 minutes.

## Erreurs

| Code | Statut | Signification |
| :--- | :--- | :--- |
| `VIVINO_DISABLED` | 503 | `VIVINO_ENABLED` ne vaut pas `true`. |
| `VIVINO_NO_MATCH` | 404 | Rien d'assez proche. `details.reason` : `NO_CANDIDATE`, `COLOR_MISMATCH` (Vivino n'a qu'une autre couleur de ce producteur), `UNREADABLE_PAGE` (les pages de Vivino ont changé). |
| `VIVINO_UNAVAILABLE` | 503 | Vivino est injoignable, ou les recherches sont en pause après un blocage (`details.blocked`). |
| `VIVINO_RATE_LIMITED` | 429 | Le membre a épuisé ses recherches pour le moment. |
| `VALIDATION_ERROR` | 400 | Pas de producteur, un spiritueux ou un cigare, ou une valeur hors des limites de la fiche. |

**Le "Pare-feu" (Troubleshooting)** :
* *Toutes les recherches répondent `VIVINO_NO_MATCH` avec `UNREADABLE_PAGE`* : Vivino a changé ses pages. Tout ce qui les lit se trouve dans `api/src/services/vivino/parsing.ts`.
* *Toutes les recherches répondent `VIVINO_UNAVAILABLE`* : vérifier que le conteneur de l'API peut joindre `www.vivino.com`, et les lignes `[vivino]` de `docker compose logs api`.
