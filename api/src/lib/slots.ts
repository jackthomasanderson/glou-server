import type { PrismaClientOrTx } from './prisma';

/**
 * #174: a trashed unit keeps its grid slot, which may have been given to
 * another unit since. True when another unit out of the trash holds the slot
 * `unit` would take back on restore — it is then restored unplaced.
 */
export async function isSlotTaken(
  client: PrismaClientOrTx,
  unit: { id: string; cellarId: string | null; slotColumn: number | null; slotRow: number | null },
): Promise<boolean> {
  if (!unit.cellarId || unit.slotColumn == null || unit.slotRow == null) return false;
  const occupant = await client.inventoryItem.findFirst({
    where: {
      cellarId: unit.cellarId,
      slotColumn: unit.slotColumn,
      slotRow: unit.slotRow,
      id: { not: unit.id },
      deletedAt: null,
    },
    select: { id: true },
  });
  return occupant !== null;
}
