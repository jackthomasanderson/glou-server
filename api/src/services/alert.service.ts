import { prisma } from '../lib/prisma';

export type AlertStatus = 'none' | 'approaching' | 'peak' | 'past';

/**
 * Computes the drinking window alert status from structured peak maturity years.
 * Returns 'none' if no window is defined.
 * Ignores alertsPaused — caller decides whether to suppress display.
 */
export function computeAlertStatus(
  peakMaturityFrom: number | null | undefined,
  peakMaturityTo: number | null | undefined,
): AlertStatus {
  if (!peakMaturityFrom && !peakMaturityTo) return 'none';

  const currentYear = new Date().getFullYear();
  const from = peakMaturityFrom ?? peakMaturityTo!;
  const to = peakMaturityTo ?? peakMaturityFrom!;

  if (currentYear < from) return 'approaching';
  if (currentYear > to) return 'past';
  return 'peak';
}

/**
 * Returns all active (non-deleted) inventory items with a computed alert status,
 * excluding paused alerts and 'none' status.
 * Sorted by urgency: past → peak → approaching.
 */
export async function getAlerts() {
  const items = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      alertStatus: { in: ['approaching', 'peak', 'past'] },
      alertsPaused: false,
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      producer: true,
      category: true,
      vintage: true,
      peakMaturityFrom: true,
      peakMaturityTo: true,
      alertStatus: true,
      alertsPaused: true,
      cellarId: true,
      collection: true,
      photoUrl: true,
    },
  });

  const urgencyOrder: Record<string, number> = { past: 0, peak: 1, approaching: 2 };
  return items.sort(
    (a, b) => (urgencyOrder[a.alertStatus ?? 'approaching'] ?? 2) - (urgencyOrder[b.alertStatus ?? 'approaching'] ?? 2),
  );
}

/**
 * Toggles alert pause for a single inventory item.
 */
export async function toggleAlertPause(id: string): Promise<boolean> {
  const item = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: null } });
  if (!item) return false;

  await prisma.inventoryItem.update({
    where: { id },
    data: { alertsPaused: !item.alertsPaused, updatedAt: new Date() },
  });
  return true;
}
