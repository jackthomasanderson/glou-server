import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * #621: every React Query cache key of the web app, in one place. A key is
 * never written as a literal array anywhere else (ESLint `no-restricted-syntax`
 * in eslint.config.mjs): an invalidation by prefix then reads here, not by
 * grepping the hooks.
 *
 * Prefixes matter: `invalidateQueries({ queryKey })` also marks every key that
 * starts with it. Everything read from the stock rows (the flat list, the wines,
 * a wine's drawer with its history, both trash lists, the review cases) lives
 * under `inventory`.
 */
export const qk = {
  inventory: {
    /** Prefix of every query read from the stock rows (see the list in {@link invalidateAfterInventoryChange}). */
    all: ['inventory'],
    /** The flat list of bottles (still loaded by several pages, mirrored offline). */
    list: ['inventory'],
    item: (id: string) => ['inventory', id],
    trash: ['inventory', 'trash'],
    /** #475: whether the flat list hit the server's 2,000-row cap (filled by the list's fetch). */
    truncated: ['inventory-meta', 'truncated'],
    /** A wine already known, suggested while typing in the form. */
    knownWine: (key: string | undefined) => ['inventory', 'known-wine', key],
  },
  products: {
    /** #471 (D9): the wines with their bottles. */
    list: ['inventory', 'products'],
    truncated: ['inventory-meta', 'products-truncated'],
    /** #475: the wines of one cellar, read from the server once the full list was cut. */
    ofCellar: (cellarId: string) => ['inventory', 'cellar-products', cellarId],
    /** Prefix of every wine's drawer. */
    details: ['inventory', 'product'],
    /** A wine's drawer: its copies, tastings and history. */
    detail: (id: string | null) => ['inventory', 'product', id],
    trash: ['inventory', 'products-trash'],
  },
  /** #471 (FEAT-102): what is left to review after the update ("À regrouper ?"). */
  review: ['inventory', 'review'],
  cellars: {
    all: ['cellars'],
    detail: (id: string) => ['cellars', id],
    grid: (id: string) => ['cellars', id, 'grid'],
  },
  /** The sidebar badges and the bell's reminder count (#212). */
  sidebarCounts: ['stats', 'counts'],
  /** The notification bell. */
  alerts: ['alerts'],
  analytics: {
    all: ['analytics'],
    range: (from: string | undefined, to: string | undefined) => ['analytics', from, to],
  },
  budget: {
    all: ['budget'],
    envelopes: ['budget', 'envelopes'],
    progress: (id: string) => ['budget', 'progress', id],
  },
  consumptionPlan: {
    all: ['consumption-plan'],
    allSuggestions: ['consumption-plan', 'suggestions'],
    suggestions: (limit: number) => ['consumption-plan', 'suggestions', limit],
    goal: ['consumption-plan', 'goal'],
  },
  tastings: {
    all: ['tastings'],
    list: (params: { page: number; limit: number; itemId?: string; search?: string }) => ['tastings', params],
    analytics: ['tastings', 'analytics'],
  },
  wishlist: ['wishlist'],
  collections: ['collections'],
  inventoryCount: {
    all: ['inventory-count'],
    active: ['inventory-count', 'active'],
    report: (sessionId: string) => ['inventory-count', 'report', sessionId],
  },
  auth: {
    me: ['auth', 'me'],
    onboarding: ['auth', 'onboarding'],
    sessions: ['auth', 'sessions'],
    backupCodes: ['auth', 'backup-codes'],
  },
  admin: {
    users: ['admin_users'],
    auditLogs: (page: number, limit: number, filters: object) => ['admin_audit_logs', page, limit, filters],
    maturityReferences: ['admin_maturity_references'],
    backupHealth: ['admin_backup_health'],
    systemConfig: ['admin_system_config'],
    configHistory: ['admin_config_history'],
    maintenanceRuns: ['admin_maintenance_runs'],
    backupRuns: ['admin_backup_runs'],
    shares: ['admin_shares'],
  },
  guest: {
    meta: (token: string) => ['guest', token, 'meta'],
    inventory: (token: string) => ['guest', token, 'inventory'],
  },
  humidor: {
    ofCellar: (cellarId: string) => ['humidor', cellarId],
    readings: (cellarId: string) => ['humidor', cellarId, 'readings'],
  },
  scan: {
    status: ['scan-status'],
    job: (jobId: string | null) => ['scan-job', jobId],
  },
  shares: ['shares'],
  bulkPresets: ['bulk-presets'],
  appVersion: ['app-version'],
  connectivity: ['connectivity'],
  notificationPrefs: ['notification_prefs'],
} as const;

/**
 * Everything derived from the stock outside the `inventory` prefix: a bottle
 * added, changed, moved, opened, drunk or deleted changes what these show.
 */
const DERIVED_FROM_STOCK: readonly QueryKey[] = [
  qk.cellars.all, // cellar cards, their grids and slots
  qk.sidebarCounts, // sidebar badges, the bell's reminder count
  qk.alerts, // the bell
  qk.consumptionPlan.all, // "To drink" suggestions and the monthly goal
  qk.analytics.all,
  qk.budget.all, // spending of the envelopes
  qk.collections, // what each collection holds
  qk.inventoryCount.all, // a count in progress compares with the stock
];

export interface InventoryChange {
  /**
   * Keys the caller already wrote in place from the server's answer: not read
   * again. The flat list holds up to 2,000 rows and its refetch rewrites the
   * whole offline mirror (ISSUE_381, #462), too much for a one-field edit.
   */
  alreadyWritten?: readonly QueryKey[];
}

/**
 * #621: the one answer to "if a bottle changes, what must refresh?". Called by
 * every action that changes the stock — create, edit, delete, restore, bulk
 * actions, CSV import, count closure, moves on the cellar plan, wishlist
 * conversion, open/drink/put back, move part of a group, change its price,
 * correct the number, add bottles, the review of the update, the offline
 * replay. Everything listed here is marked stale; only what is on screen is
 * fetched again.
 */
export function invalidateAfterInventoryChange(queryClient: QueryClient, change: InventoryChange = {}): void {
  const kept = new Set((change.alreadyWritten ?? []).map((key) => hashKey(key)));
  void queryClient.invalidateQueries({
    queryKey: qk.inventory.all,
    predicate: kept.size > 0 ? (query) => !kept.has(query.queryHash) : undefined,
  });
  for (const queryKey of DERIVED_FROM_STOCK) void queryClient.invalidateQueries({ queryKey });
}
