import { prisma } from '../lib/prisma';
import { IN_STOCK_ITEM_FILTER } from '../lib/finished-item';
import { UNIT_TOTALS_SELECT, sumTotals } from '../lib/stock-units';
import type { SidebarCounts } from '../../../shared/stats';

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

    const [inStock, cellars, collections, activeSession, pricedWishes, remindersToday] = await Promise.all([
      // #471 (FEAT-96): bottles and cigars, not rows — a group of 6 is 6
      // bottles (shared/units.ts `itemUnits`). #573: what is in stock only.
      prisma.inventoryItem.findMany({ where: IN_STOCK_ITEM_FILTER, select: UNIT_TOTALS_SELECT }),
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

    const { bottles, cigars } = sumTotals(inStock);
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
