import { prisma } from '../lib/prisma';
import { OWNED_ITEM_FILTER } from '../lib/owned-item';
import { IN_STOCK_ITEM_FILTER } from '../lib/finished-item';
import type { SidebarCounts } from '../../../shared/stats';

/** Categories the sidebar groups under "Bouteilles" (cigars have their own badge). */
const BOTTLE_CATEGORIES = ['wine', 'sparkling', 'spirit'] as const;

/**
 * The five numbers the sidebar badges show, computed with COUNT queries (#212).
 * The sidebar used to download the full inventory, cellar, collection, wishlist
 * and count-session lists on every page — including Analytics, Profile and Admin —
 * just to write a number on a badge. Each figure here mirrors the filter of the
 * list endpoint it replaces: inventory and cellars are instance-wide, collections
 * and the wishlist belong to the user.
 */
export const statsService = {
  async getSidebarCounts(userId: string): Promise<SidebarCounts> {
    // End of "today" in UTC — matches the frontend's own
    // `reminderDate.split('T')[0] <= today` (ISO date) comparison closely
    // enough for a badge count; the detailed list (NotificationBell, on
    // open) still recomputes it client-side from the real items.
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);

    const [bottles, cigars, cellars, collections, activeSession, pricedWishes, remindersToday] = await Promise.all([
      // #573: what is in stock, like the list counter (#504) and the cellar cards.
      prisma.inventoryItem.count({ where: { ...IN_STOCK_ITEM_FILTER, category: { in: [...BOTTLE_CATEGORIES] } } }),
      prisma.inventoryItem.count({ where: { ...IN_STOCK_ITEM_FILTER, category: 'cigar' } }),
      prisma.cellar.count(),
      prisma.collection.count({ where: { userId } }),
      prisma.inventoryCountSession.findFirst({
        where: { status: { in: ['active', 'paused'] } },
        select: { id: true },
      }),
      // Two columns of one row cannot be compared with Prisma's `where`, and a
      // wishlist is a handful of rows: select the two prices and compare here.
      prisma.wishlistItem.findMany({
        where: { userId, status: 'active', lastSeenPrice: { not: null }, maxPrice: { not: null } },
        select: { lastSeenPrice: true, maxPrice: true },
      }),
      prisma.inventoryItem.count({
        where: { deletedAt: null, ...OWNED_ITEM_FILTER, reminderDate: { not: null, lte: endOfToday } },
      }),
    ]);

    return {
      bottles,
      cigars,
      cellars,
      collections,
      countSessionActive: activeSession !== null,
      wishlistReady: pricedWishes.filter((w) => (w.lastSeenPrice as number) <= (w.maxPrice as number)).length,
      remindersToday,
    };
  },
};
