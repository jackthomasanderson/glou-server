import { prisma } from '../lib/prisma';
import { BudgetEnvelopeCreateInput, BudgetEnvelopePatchInput } from '../schemas/budget.schema';

/**
 * FEAT-20: Budget envelopes — personal by design, same nuance documented in
 * wishlist.service.ts and consumption-plan.service.ts (ConsumptionGoal): a
 * budget envelope is an individual spending plan, not shared-inventory data,
 * so `userId` scoping here is legitimate (not the audit-only field it is on
 * InventoryItem/Cellar/etc — see design.md invariant).
 */

export async function listBudgetEnvelopes(userId: string) {
  return prisma.budgetEnvelope.findMany({
    where: { userId },
    orderBy: { periodStart: 'desc' },
  });
}

export async function getBudgetEnvelope(userId: string, id: string) {
  return prisma.budgetEnvelope.findFirst({ where: { id, userId } });
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

export async function updateBudgetEnvelope(userId: string, id: string, patch: BudgetEnvelopePatchInput) {
  const existing = await prisma.budgetEnvelope.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.budgetEnvelope.update({ where: { id }, data: patch });
}

export async function deleteBudgetEnvelope(userId: string, id: string): Promise<boolean> {
  const existing = await prisma.budgetEnvelope.findFirst({ where: { id, userId } });
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
 * "Spent" = sum of `purchasePrice` on InventoryItem rows created by THIS
 * user (`userId` on InventoryItem, its audit field — see design.md) whose
 * `createdAt` falls inside the envelope's period. This is legitimate: we are
 * not filtering the shared inventory LIST by userId (that would violate the
 * invariant — nobody's view of the cellar should shrink), we are computing
 * "how much did *I* personally spend", an aggregate that is inherently
 * personal regardless of the underlying data being shared. Every other
 * member's purchases remain fully visible to them and to this user via the
 * regular inventory views — this aggregate simply doesn't include them,
 * exactly like getGoalProgress in consumption-plan.service.ts.
 */
export async function getBudgetProgress(userId: string, envelopeId: string): Promise<BudgetProgress | null> {
  const envelope = await prisma.budgetEnvelope.findFirst({ where: { id: envelopeId, userId } });
  if (!envelope) return null;

  const result = await prisma.inventoryItem.aggregate({
    where: {
      userId,
      deletedAt: null,
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
