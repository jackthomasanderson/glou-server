# Tableau des bouteilles (persistance PostgreSQL)

## TL;DR
CRUD multi-catégorie avec UI optimiste, suppression douce (soft-delete) et restauration.
**Les données persistent dans PostgreSQL** et survivent aux redémarrages. Chaque bouteille est liée à un cellier et isolée par utilisateur.

## Prérequis
- Frontend Next + Backend API Node.js + PostgreSQL en cours d'exécution
- Au moins un cellier créé (FEAT-24) avant d'ajouter des bouteilles
- Comprendre que les données sont isolées par `user_id` (multi-tenancy)

> [!NOTE]
> **Mise à jour FEAT-55** : Les bouteilles sont désormais totalement persistées dans PostgreSQL avec multi-tenancy (filtrage par user_id) et relations aux celliers. Le redémarrage de l'application ne perd aucune donnée.

## Action
1. Accédez au dashboard principal `/dashboard`.
2. Saisissez le tronc commun : nom d'affichage, catégorie, emplacement/collection éventuels, tags, valeur estimée, niveau, état d'alerte, statut entamé.
3. Le cellarId est auto-sélectionné si vous n'avez qu'un seul cellier. Sinon, choisissez le cellier de destination.
4. Complétez les essentiels de catégorie (vin/bulles/spiritueux/cigare) puis, si besoin, affichez les compléments optionnels.
5. Enregistrez : l'entrée apparaît immédiatement (Optimistic UI) puis est persistée en base; les validations Zod empêchent les champs manquants ou incohérents.
6. Modifiez via le bouton Modifier pour recharger le formulaire, puis sauvegardez.
7. Supprimez : l'élément est marqué avec `deleted_at` (soft-delete) mais reste en base. Vous pouvez restaurer via le bouton Restore.

## Endpoints API (Backend)
- `GET /api/bottles` - Liste toutes les bouteilles de l'utilisateur (exclut deleted)
- `GET /api/bottles/cellar/:cellarId` - Liste les bouteilles d'un cellier spécifique
- `GET /api/bottles/:id` - Récupère une bouteille par ID
- `POST /api/bottles` - Crée une nouvelle bouteille (nécessite cellarId)
- `PUT /api/bottles/:id` - Met à jour une bouteille existante
- `DELETE /api/bottles/:id` - Soft-delete (SET deleted_at = CURRENT_TIMESTAMP)
- `PATCH /api/bottles/:id/restore` - Restaure une bouteille supprimée (SET deleted_at = NULL)

## Schéma de Données
Voir migration SQL `db/init/06-feat-55-bottles-persistent.sql` pour le schéma complet (50+ colonnes).

Colonnes principales :
- `id` (UUID), `user_id` (FK), `cellar_id` (FK), `category` (enum)
- `label`, `producer_name`, `vintage_or_none`, `abv`, `fill_level`
- Attributs spécifiques: wine (appellation, grapes), sparkling (dosage, disgorgement), spirit (age_statement, cask_type), cigar (wrapper, quantity_in_box)
- Métadonnées : `created_at`, `updated_at`, `deleted_at` (soft-delete)

## Pourquoi ça ne marche pas ?
- ~~Disparition des données après un restart~~ : **CORRIGÉ dans FEAT-55** — Toutes les bouteilles persistent dans PostgreSQL.
- **cellarId manquant** : Assurez-vous qu'un cellier existe avant de créer des bouteilles. Le frontend auto-sélectionne le premier si disponible.
- Champs refusés : vérifiez les obligations par catégorie (ex: `producer`/`name`/`vintageOrNone` pour vin) et les bornes numériques (ABV 0-100%, quantité > 0).
- Erreur 401 Unauthorized : votre session a expiré, reconnectez-vous.
- Erreur 404 Not Found : l'ID bouteille n'existe pas ou appartient à un autre utilisateur.
- Erreur 500 Internal Server Error : consultez les logs API (`api/logs/`) pour détails.

## Tests
Tests unitaires disponibles dans `api/src/__tests__/bottles.test.ts` :
- Création avec catégories multiples (wine, sparkling, spirit, cigar)
- Validation des contraintes (ABV spirits 20-80%, vintages YYYY ou NV)
- Soft-delete et isolation multi-utilisateur

Lancer les tests :
```bash
cd api && npm test
```

## Sécurité & Performance
- **Authentification** : authMiddleware obligatoire sur tous les endpoints
- **Isolation multi-tenant** : filtrage systématique `WHERE user_id = $1`
- **SQL Injection** : requêtes paramétrées avec `$1, $2, ...`
- **Index** : user_id, cellar_id, category, deleted_at pour requêtes rapides (<100ms)
- **Soft-delete** : les données supprimées restent auditables (RGPD-friendly)
