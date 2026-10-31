import type { BottleCategory, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { IN_STOCK_ITEM_FILTER } from '../lib/finished-item';
import { UNIT_STATE_COLUMNS, unitsOfGroups } from '../lib/stock-units';
import type { SidebarCounts } from '../../../shared/stats';

/** Categories the sidebar groups under "Bouteilles" (cigars have their own badge). */
const BOTTLE_CATEGORIES = ['wine', 'sparkling', 'spirit'] as const;

/**
 * Units in stock of some categories (#471, FEAT-96): bottles and cigars, not
 * rows — a group of 6 is 6 bottles (shared/units.ts `itemUnits`). Grouped by
 * unit state in SQL, so a page load never reads every row (#573: in stock only).
 */
async function unitsInStock(category: Prisma.EnumBottleCategoryFilter | BottleCategory): Promise<number> {
  const groups = await prisma.inventoryItem.groupBy({
    by: [...UNIT_STATE_COLUMNS],
    where: { ...IN_STOCK_ITEM_FILTER, product: { category } },
    _count: { _all: true },
  });
  return unitsOfGroups(groups);
}

/**
 * The numbers the sidebar badges show (#212). The sidebar used to download the
 * full inventory, cellar, collection, wishlist and count-session lists on
 * every page just to write a number on a badge. Inventory and cellars are
 * instance-wide, collections and the wishlist belong to the user.
 */
export const statsService = {
  async getSidebarCounts(userId: string): Promise<SidebarCounts> {
    // End of "today" in the instance's time zone (`TZ`, #575), like the
    // cellar cards' reminder count.
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [bottles, cigars, cellars, collections, activeSession, pricedWishes, remindersToday] = await Promise.all([
      unitsInStock({ in: [...BOTTLE_CATEGORIES] }),
      unitsInStock('cigar'),
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
      // #471: the reminder is on the family — one per wine in stock.
      prisma.product.count({
        where: {
          deletedAt: null,
          reminderDate: { not: null, lte: endOfToday },
          items: { some: IN_STOCK_ITEM_FILTER },
        },
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
