import { prisma } from '../lib/prisma';
import { BudgetEnvelopeCreateInput, BudgetEnvelopePatchInput } from '../schemas/budget.schema';
import { OWNED_ITEM_FILTER } from '../lib/owned-item';
import { itemSpend } from '../lib/finished-item';

/**
 * ISSUE_142: budget envelopes are household-wide, not personal. `userId` on
 * BudgetEnvelope is an audit-only field (who created the envelope), exactly
 * like `userId` on InventoryItem — it is never used to scope what a caller
 * can list, read, edit, delete, or count against. Every member of the
 * household sees and manages the same envelopes and the same "spent"
 * total, which is now the spending across the full shared inventory for the
 * envelope's period (see `getBudgetProgress`), not just items this caller created.
 */

export async function listBudgetEnvelopes() {
  return prisma.budgetEnvelope.findMany({
    orderBy: { periodStart: 'desc' },
  });
}

export async function getBudgetEnvelope(id: string) {
  return prisma.budgetEnvelope.findFirst({ where: { id } });
}

export async function createBudgetEnvelope(userId: string, input: BudgetEnvelopeCreateInput) {
  return prisma.budgetEnvelope.create({
    data: {
      userId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      amount: input.amount,
    },
  });
}

export async function updateBudgetEnvelope(id: string, patch: BudgetEnvelopePatchInput) {
  const existing = await prisma.budgetEnvelope.findFirst({ where: { id } });
  if (!existing) return null;
  return prisma.budgetEnvelope.update({ where: { id }, data: patch });
}

export async function deleteBudgetEnvelope(id: string): Promise<boolean> {
  const existing = await prisma.budgetEnvelope.findFirst({ where: { id } });
  if (!existing) return false;
  await prisma.budgetEnvelope.delete({ where: { id } });
  return true;
}

/**
 * `purchasedAt` is a day (`@db.Date`, stored as midnight UTC). An envelope's
 * bounds are days too: the web sends `YYYY-MM-DD` read as midnight UTC
 * (BudgetPanel). Their UTC calendar day is compared — never their local one,
 * which west of UTC is the day before (30 Sept. for 1 Oct.).
 */
const dayOf = (moment: Date): Date =>
  new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()));

export interface BudgetProgress {
  envelope: Awaited<ReturnType<typeof prisma.budgetEnvelope.findFirst>>;
  spent: number;
  remaining: number;
  percent: number;
}

/**
 * "Spent" (#471, FEAT-96) = `itemSpend` (purchase price of one copy × copies
 * bought) across the whole shared inventory (not scoped to any one member —
 * see file-level note): drunk and written-off copies included, as only an
 * "input error" correction lowers `quantity`. A purchase belongs to the
 * envelope's period by its purchase day (`purchasedAt`, point 58), else by the
 * day it was recorded (`createdAt`, units older than the purchase date, #578).
 */
export async function getBudgetProgress(envelopeId: string): Promise<BudgetProgress | null> {
  const envelope = await prisma.budgetEnvelope.findFirst({ where: { id: envelopeId } });
  if (!envelope) return null;

  const units = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      // FEAT-87: a non-owned reference was never bought, so it never counts
      // as money spent, even when a price was recorded on it.
      ...OWNED_ITEM_FILTER,
      purchasePrice: { not: null },
      OR: [
        { purchasedAt: { gte: dayOf(envelope.periodStart), lte: dayOf(envelope.periodEnd) } },
        { purchasedAt: null, createdAt: { gte: envelope.periodStart, lte: envelope.periodEnd } },
      ],
    },
    select: { quantity: true, purchasePrice: true },
  });

  // Cents: a sum of decimal prices must not show 59.97000000000001.
  const spent = Math.round(units.reduce((sum, unit) => sum + itemSpend(unit), 0) * 100) / 100;
  const remaining = Math.max(0, envelope.amount - spent);
  const percent = envelope.amount > 0 ? Math.min(100, Math.round((spent / envelope.amount) * 100)) : 0;

  return { envelope, spent, remaining, percent };
}
