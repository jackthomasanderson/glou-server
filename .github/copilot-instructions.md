# GitHub Copilot Instructions

## Principes Généraux
- Respecter la stack: Docker Compose, Node.js backend, Next.js frontend, PostgreSQL; pas d’ajouts exotiques sans justification claire (YAGNI).
- Nommer en anglais métier explicite (ex: fillingLevel, peakMaturity). Préférer TypeScript pour front/back.
- Internationalisation FR/EN: toutes les chaînes via des clés centralisées; jamais de texte en dur dans le code.
- Optimistic UI obligatoire pour les mutations: retour instantané côté client puis synchronisation serveur/PostgreSQL en tâche de fond.
- Gestion d’erreurs: fallback visuel systématique, journalisation côté serveur, aucune perte silencieuse.
- Sécurité: exécution non-root (PUID/PGID), lecture des secrets/ports via .env, support des headers proxy (X-Forwarded-For).
- Préserver l’intégrité métier: les overrides manuels utilisateur priment toujours sur les données enrichies tierces.

## Frontend (Next.js)
- Rendu hybride: choisir SSG/ISR/SSR selon besoin de fraîcheur; éviter le tout-SSR par défaut.
- État: privilégier React Query/TanStack Query pour le cache client + invalidations; configurer les mutations en optimistic update avec rollback sur échec.
- Accessibilité et perf: lazy-load des modules lourds, images optimisées, suspense/boundaries pour états de chargement/erreur.
- i18n: utiliser un provider central; clés stables; ne pas concaténer de chaînes dynamiques non traduisibles.
- Tests: ajouter des tests de rendu/comportement (ex: React Testing Library) pour les flows critiques.

## Backend (Node.js)
- API métier centralisée, orchestrant OCR/imports et enrichissements tiers.
- Gestion asynchrone: ne pas bloquer la boucle d’événements pour l’OCR ou les imports; préférer des jobs/tâches de fond.
- Validation d’entrée: schémas (ex: Zod/JSON Schema) à toutes les frontières réseau.
- Journalisation structurée (niveau info/warn/error) et propagation de corrélation (trace/request id) si disponible.
- Couche d’intégrité: appliquer la règle « override utilisateur > données enrichies » avant persistance.

## Base de Données (PostgreSQL)
- Source de vérité unique; caches locaux autorisés mais invalidés après mutation.
- Transactions pour les écritures critiques; conserver l’idempotence des jobs d’import/OCR.
- Indexation ciblée sur les clés de recherche usuelles (ex: étiquettes, domaines, millésimes) sans sur-indexer.

## APIs Tierces
- Vivino/Whiskybase: appels REST avec cache PostgreSQL; éviter les sur-appels (backoff, ETag/If-Modified-Since si dispo).
- OCR/Vision: POST stateless; prévoir timeouts et retries avec jitter; marquer les jobs pour reprise idempotente.

## Infrastructure (Docker Compose)
- Conteneurs non-root avec PUID/PGID issus du .env; volumes explicites pour données et logs.
- Healthchecks pour chaque service (API, frontend, PostgreSQL) avec dépendances `depends_on` conditionnées à la santé.
- Exposition des ports via variables .env; ne pas coder en dur.

## Sécurité & Configuration
- Secrets, ports et identités uniquement via .env; jamais en dur ni en dépôt.
- Nettoyer les entrées (headers, payloads) et respecter X-Forwarded-For pour le logging IP.
- CORS et headers HTTP sécurisés (no sniff, frameguard, HSTS si public) adaptés au déploiement Home Lab.

## Qualité & Tests
- Inclure des tests unitaires/intégration pour les parcours critiques (mutations optimistic, imports, OCR). Priorité aux tests déterministes.
- Lint/format: appliquer les règles du projet; pas de règles ad hoc.

## Garde-fous Copilot
- Ne pas modifier les fichiers dans .vibe/ (réservés aux agents de spécification) sauf demande explicite.
- Proposer des changements minimalistes et alignés sur la stack existante; pas de refonte non demandée.
- Préférer la clarté et la simplicité à la complexité; documenter brièvement les choix non évidents dans le code si utile.
