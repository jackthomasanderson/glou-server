import { prisma } from '../lib/prisma';
import { BudgetEnvelopeCreateInput, BudgetEnvelopePatchInput } from '../schemas/budget.schema';
import { OWNED_ITEM_FILTER } from '../lib/owned-item';

/**
 * ISSUE_142: budget envelopes are household-wide, not personal. `userId` on
 * BudgetEnvelope is an audit-only field (who created the envelope), exactly
 * like `userId` on InventoryItem — it is never used to scope what a caller
 * can list, read, edit, delete, or count against. Every member of the
 * household sees and manages the same envelopes and the same "spent"
 * total, which is now the sum of `purchasePrice` across the full shared
 * inventory for the envelope's period, not just items this caller created.
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

export interface BudgetProgress {
  envelope: Awaited<ReturnType<typeof prisma.budgetEnvelope.findFirst>>;
  spent: number;
  remaining: number;
  percent: number;
}

/**
 * "Spent" = sum of `purchasePrice` across the whole shared inventory (not
 * scoped to any one member — see file-level note) whose `createdAt` falls
 * inside the envelope's period.
 */
export async function getBudgetProgress(envelopeId: string): Promise<BudgetProgress | null> {
  const envelope = await prisma.budgetEnvelope.findFirst({ where: { id: envelopeId } });
  if (!envelope) return null;

  const result = await prisma.inventoryItem.aggregate({
    where: {
      deletedAt: null,
      // FEAT-87: a non-owned reference was never bought, so it never counts
      // as money spent, even when a price was recorded on it.
      ...OWNED_ITEM_FILTER,
      createdAt: { gte: envelope.periodStart, lte: envelope.periodEnd },
      purchasePrice: { not: null },
    },
    _sum: { purchasePrice: true },
  });

  const spent = result._sum.purchasePrice ?? 0;
  const remaining = Math.max(0, envelope.amount - spent);
  const percent = envelope.amount > 0 ? Math.min(100, Math.round((spent / envelope.amount) * 100)) : 0;

  return { envelope, spent, remaining, percent };
}
