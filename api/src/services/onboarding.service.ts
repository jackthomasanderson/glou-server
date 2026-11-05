import { prisma } from '../lib/prisma';
import { IN_STOCK_ITEM_FILTER } from '../lib/finished-item';
import { UNIT_TOTALS_SELECT, sumTotals } from '../lib/stock-units';
import type { OnboardingState } from '../../../shared/onboarding';

/**
 * FEAT-89/FEAT-90: the setup wizard's view of the instance. Everything here is
 * derived from existing data except the "Later" flag, which lives on the
 * session (design.md glossary): no second source of truth for the wizard.
 */
export const onboardingService = {
  async getState(userId: string, sessionId: string): Promise<OnboardingState> {
    const [session, cellarCount, ownCellar, inStock] = await Promise.all([
      sessionId
        ? prisma.session.findUnique({ where: { id: sessionId }, select: { onboardingPostponedAt: true } })
        : Promise.resolve(null),
      prisma.cellar.count(),
      // `Cellar.userId` is an audit field: used to choose what the wizard
      // shows, never to restrict access (design.md).
      prisma.cellar.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      }),
      // #471 (FEAT-96): bottles and cigars, not rows (shared/units.ts `itemUnits`).
      prisma.inventoryItem.findMany({ where: IN_STOCK_ITEM_FILTER, select: UNIT_TOTALS_SELECT }),
    ]);
    const { bottles, cigars } = sumTotals(inStock);

    return {
      postponed: session?.onboardingPostponedAt != null,
      joining: cellarCount > 0 && ownCellar === null,
      wizardCellar: ownCellar,
      cellarCount,
      bottleCount: bottles,
      cigarCount: cigars,
    };
  },

  /** "Later": closes the wizard until the next sign-in, which is a new session. */
  async postpone(userId: string, sessionId: string): Promise<boolean> {
    if (!sessionId) return false;
    const { count } = await prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { onboardingPostponedAt: new Date() },
    });
    return count > 0;
  },
};
