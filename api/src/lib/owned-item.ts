/**
 * FEAT-87: an inventory item is either OWNED (physically held by the
 * instance) or a NON-OWNED REFERENCE — described without being possessed: a
 * wine tasted elsewhere, or a producer's range tracked without buying it.
 * See the Glossaire Métier of _projet/design.md for the term itself.
 *
 * A reference is invisible to everything that describes what the instance
 * holds: valuation, counters, peak-maturity alerts, consumption suggestions,
 * inventory counts, budget and the guest showcase. It stays a valid tasting
 * target, and the full inventory list still returns it (the client hides it
 * behind a filter), which is why this is an explicit filter on the aggregate
 * paths rather than a global default.
 */

/** Restricts a query to what the instance actually holds. */
export const OWNED_ITEM_FILTER = { isOwned: true } as const;
