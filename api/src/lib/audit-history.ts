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

/** What {@link withoutUndone} reads of a field-history log. */
export interface HistoryLog {
  userId: string;
  action: string;
  bottleId: string | null;
  details: unknown;
  createdAt: Date;
}

/**
 * How long after an action its "Annuler" (the message shown 5 seconds, or
 * "Annuler l'ouverture" right after) still takes it back as if it never
 * happened. Past it, both stay in the history.
 */
export const UNDO_WINDOW_MS = 60_000;

type Change = { field: string; from: unknown; to: unknown };
type StateDetails = { outcome?: string; subItemId?: string; targetItemId?: string; absorbedFrom?: string; deletedTastings?: number; changes?: Change[] };

const detailsOf = (log: HistoryLog) => (log.details ?? {}) as StateDetails;

/** The sub-record a detach / reattach entry is about, on either side (the bottle, its group); null otherwise. */
function subRecordOf(log: HistoryLog): string | null {
  const details = detailsOf(log);
  if (details.subItemId) return details.subItemId;
  if (details.outcome === 'detached') return details.absorbedFrom ?? log.bottleId;
  if (details.outcome === 'reattached' || details.outcome === 'regrouped') return details.targetItemId ?? null;
  return null;
}

/** A closed bottle without a level is full: `fillLevel` null and 100 say the same. */
const sameValue = (field: string, a: unknown, b: unknown) =>
  field === 'fillLevel' ? (a ?? 100) === (b ?? 100) : JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** `later` puts back every field `first` changed, and changes nothing else: together, nothing happened. */
function cancelsOut(first: Change[], later: Change[]): boolean {
  const before = new Map(first.map((change) => [change.field, change.from]));
  const after = new Map(first.map((change) => [change.field, change.to]));
  for (const change of later) {
    if (!before.has(change.field)) before.set(change.field, change.from);
    after.set(change.field, change.to);
  }
  return [...before.keys()].every((field) => sameValue(field, before.get(field), after.get(field)));
}

/**
 * Recette #471: an opening, a drink or a smoke taken back at once ("1
 * bouteille ouverte · Annuler") leaves nothing in a wine's history — not the
 * four technical entries of a bottle detached then put back. Taken back:
 * by the same member, within {@link UNDO_WINDOW_MS}, and either the bottle
 * detached went back to its line (a tasting deleted with it is told), or
 * the next write of a lone bottle cancelled its state change exactly. The
 * audit log itself keeps everything. `logs`: most recent first.
 */
export function withoutUndone<L extends HistoryLog>(logs: readonly L[]): L[] {
  const hidden = new Set<L>();
  const chronological = [...logs].reverse();

  // A sub-record detached, then put back.
  for (const back of chronological) {
    const details = detailsOf(back);
    if ((details.outcome !== 'reattached' && details.outcome !== 'regrouped') || details.subItemId || details.deletedTastings) continue;
    const sub = subRecordOf(back);
    const opened = chronological.find((log) => detailsOf(log).outcome === 'detached' && !detailsOf(log).subItemId && subRecordOf(log) === sub);
    if (!sub || !opened || opened.userId !== back.userId) continue;
    const from = opened.createdAt.getTime();
    const to = back.createdAt.getTime();
    if (to - from < 0 || to - from > UNDO_WINDOW_MS) continue;
    for (const log of chronological) {
      const time = log.createdAt.getTime();
      const aboutSub = subRecordOf(log) === sub || detailsOf(log).absorbedFrom === sub || log.bottleId === sub;
      if (aboutSub && time >= from && time <= to) hidden.add(log);
    }
  }

  // A lone bottle's state written, then written back.
  const lastOn = new Map<string, L>();
  for (const log of chronological) {
    if (hidden.has(log) || !log.bottleId) continue;
    const previous = lastOn.get(log.bottleId);
    lastOn.set(log.bottleId, log);
    if (!previous || hidden.has(previous)) continue;
    const [first, later] = [detailsOf(previous), detailsOf(log)];
    if (!first.outcome || !later.outcome || later.deletedTastings) continue;
    if (previous.action !== 'UPDATE' || log.action !== 'UPDATE' || previous.userId !== log.userId) continue;
    if (log.createdAt.getTime() - previous.createdAt.getTime() > UNDO_WINDOW_MS) continue;
    if (cancelsOut(first.changes ?? [], later.changes ?? [])) {
      hidden.add(previous);
      hidden.add(log);
      lastOn.delete(log.bottleId);
    }
  }

  return logs.filter((log) => !hidden.has(log));
}
