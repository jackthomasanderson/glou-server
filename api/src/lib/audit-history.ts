import { Prisma } from '@prisma/client';
import type { PrismaClientOrTx } from './prisma';

/**
 * #471: the history of lines absorbed by another one (lines joined, a merge,
 * a move, an opened bottle put back) follows the survivor. Each entry keeps
 * the line it was recorded on (`absorbedFrom`, the first one if absorbed
 * again): its values were that line's, so restoring one would rewrite every
 * copy of the survivor — never offered (readFieldHistory: `absorbed`).
 */
export async function moveHistoryOnto(tx: PrismaClientOrTx, survivorId: string, absorbedIds: string[]): Promise<void> {
  if (absorbedIds.length === 0) return;
  await tx.$executeRaw`UPDATE "audit_logs" SET "bottleId" = ${survivorId},
    "details" = coalesce("details", '{}'::jsonb) || jsonb_build_object('absorbedFrom', coalesce("details"->>'absorbedFrom', "bottleId"))
    WHERE "bottleId" IN (${Prisma.join(absorbedIds)})`;
}
