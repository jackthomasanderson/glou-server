import { Prisma } from '@prisma/client';
import type { PrismaClientOrTx } from './prisma';
import type { HistoryGesture } from '../../../shared/product';

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
  /** #695: null once the member was deleted for good. */
  userId: string | null;
  action: string;
  bottleId: string | null;
  details: unknown;
  createdAt: Date;
}

/**
 * How long after an action its "Annuler" (the message shown 8 seconds, or
 * "Annuler l'ouverture" right after) still takes it back as if it never
 * happened. Past it, both stay in the history.
 */
export const UNDO_WINDOW_MS = 60_000;

type Change = { field: string; from: unknown; to: unknown };
type StateDetails = { shareId?: string; outcome?: string; subItemId?: string; targetItemId?: string; absorbedFrom?: string; deletedTastings?: number; changes?: Change[] };

const detailsOf = (log: HistoryLog) => (log.details ?? {}) as StateDetails;

/** The sub-record a detach / reattach entry is about, on either side (the bottle, its group); null otherwise. */
function subRecordOf(log: HistoryLog): string | null {
  const details = detailsOf(log);
  if (details.subItemId) return details.subItemId;
  if (details.outcome === 'detached') return details.absorbedFrom ?? log.bottleId;
  if (details.outcome === 'reattached' || details.outcome === 'regrouped') return details.targetItemId ?? null;
  return null;
}

/**
 * Who wrote an entry: a member, or a guest's share — a guest's move is logged
 * with the userId of the share's creator (GUEST_UPDATE), so the userId alone
 * does not tell them apart (review of #830).
 */
const actorOf = (log: HistoryLog) =>
  log.action === 'GUEST_UPDATE' ? `${log.userId}|share:${detailsOf(log).shareId ?? ''}` : `${log.userId}|member`;

/** A write of a copy's state (opened, level, cigars left); an in-place one is logged without `outcome`. */
const STATE_FIELDS = new Set(['isOpened', 'fillLevel', 'cigarsLeft']);
/** The actions that write a copy's state: a member's edit, a guest's move. */
const STATE_ACTIONS = new Set(['UPDATE', 'GUEST_UPDATE']);
const isStateWrite = (details: StateDetails) => (details.changes ?? []).some((change) => STATE_FIELDS.has(change.field));

/** A closed bottle without a level is full: `fillLevel` null and 100 say the same. */
const sameValue = (field: string, a: unknown, b: unknown) =>
  field === 'fillLevel' ? (a ?? 100) === (b ?? 100) : JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What a closed copy's state does not say: a closed copy has no opening date
 * (the date is cleared on closing, without being recorded), and a closed box
 * is complete (its count is cleared, or recorded as the size of the box).
 */
const MOOT_WHEN_CLOSED = new Set(['openedAt', 'cigarsLeft']);

/** `later` puts back every field `first` changed, and changes nothing else: together, nothing happened. */
function cancelsOut(first: Change[], later: Change[]): boolean {
  const before = new Map(first.map((change) => [change.field, change.from]));
  const after = new Map(first.map((change) => [change.field, change.to]));
  for (const change of later) {
    if (!before.has(change.field)) before.set(change.field, change.from);
    after.set(change.field, change.to);
  }
  // Recette #847 (KO 4.4): "J'en fume un" on a closed box, then "Annuler" —
  // opened at that time with 24 left, put back closed "with 25 left": closed
  // on both ends, the same box.
  const closed = before.has('isOpened') && before.get('isOpened') !== true && after.get('isOpened') !== true;
  return [...before.keys()].every((field) =>
    (closed && MOOT_WHEN_CLOSED.has(field)) || sameValue(field, before.get(field), after.get(field)));
}

/**
 * Recette #471: an opening, a drink or a smoke taken back at once ("1
 * bouteille ouverte · Annuler") leaves nothing in a wine's history — not the
 * four technical entries of a bottle detached then put back. Taken back:
 * by the same member (or guest share), with no one else writing on that
 * bottle meanwhile, within {@link UNDO_WINDOW_MS}, and either the bottle
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
    if (!sub || !opened || actorOf(opened) !== actorOf(back)) continue;
    const from = opened.createdAt.getTime();
    const to = back.createdAt.getTime();
    if (to - from < 0 || to - from > UNDO_WINDOW_MS) continue;
    const inWindow = chronological.filter((log) => {
      const time = log.createdAt.getTime();
      const aboutSub = subRecordOf(log) === sub || detailsOf(log).absorbedFrom === sub || log.bottleId === sub;
      return aboutSub && time >= from && time <= to;
    });
    // Recette #847 (KO 8.2): the group's own entries ("Quantité : 6 → 5",
    // "5 → 6") are written by the same requests but on their own, so a few
    // milliseconds after (or before) the bottle's — the "→ 6" fell out of the
    // window and stayed told. A guest's never named the bottle at all.
    for (const [anchor, line] of [[opened, detailsOf(opened).targetItemId], [back, lineOf(back)]] as const) {
      const group = groupEntryOf(chronological, anchor, line, sub);
      if (group && !inWindow.includes(group)) inWindow.push(group);
    }
    // Someone else wrote on that bottle meanwhile: nothing of it is hidden.
    if (inWindow.some((log) => actorOf(log) !== actorOf(back))) continue;
    for (const log of inWindow) hidden.add(log);
  }

  // A lone bottle's state written, then written back.
  const lastOn = new Map<string, L>();
  for (const log of chronological) {
    if (hidden.has(log) || !log.bottleId) continue;
    const previous = lastOn.get(log.bottleId);
    lastOn.set(log.bottleId, log);
    if (!previous || hidden.has(previous)) continue;
    const [first, later] = [detailsOf(previous), detailsOf(log)];
    if (!isStateWrite(first) || !isStateWrite(later) || later.deletedTastings) continue;
    // A guest's own move and its "Annuler" (GUEST_UPDATE, the same share) too.
    if (!STATE_ACTIONS.has(previous.action) || !STATE_ACTIONS.has(log.action) || actorOf(previous) !== actorOf(log)) continue;
    if (log.createdAt.getTime() - previous.createdAt.getTime() > UNDO_WINDOW_MS) continue;
    if (cancelsOut(first.changes ?? [], later.changes ?? [])) {
      hidden.add(previous);
      hidden.add(log);
      lastOn.delete(log.bottleId);
    }
  }

  return logs.filter((log) => !hidden.has(log));
}

/**
 * The entry a group wrote for the same detach or reattach as `anchor` (the
 * copy's own entry), on the group's `line`: it names the copy
 * (`subItemId`), or — a guest's, recorded before recette #847 — it is the
 * group's entry with that outcome by the same hand, nearest in time.
 */
function groupEntryOf<L extends HistoryLog>(logs: readonly L[], anchor: L, line: string | null | undefined, sub: string): L | undefined {
  const outcome = detailsOf(anchor).outcome;
  if (!line) return undefined;
  return nearest(logs, anchor, (other) => {
    const theirs = detailsOf(other);
    if (theirs.outcome !== outcome || theirs.targetItemId || lineOf(other) !== line) return false;
    return theirs.subItemId ? theirs.subItemId === sub : actorOf(other) === actorOf(anchor);
  });
}

/** How far apart the entries one request wrote can be (each is written on its own, after the transaction). */
const PAIR_WINDOW_MS = 10_000;

type PairDetails = StateDetails & { fromItemId?: string; toItemId?: string; count?: number };

/** The line an entry was recorded on, even once it moved onto a line that absorbed it. */
const lineOf = (log: HistoryLog) => detailsOf(log).absorbedFrom ?? log.bottleId;

const cellKey = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null) return null;
  const { column, row } = value as { column?: unknown; row?: unknown };
  return typeof column === 'number' && typeof row === 'number' ? `${column}:${row}` : null;
};

/**
 * The cells of a copy taken off a group, as one entry tells them: a cell the
 * group gave up and the copy took ("libérée" then "occupée") followed the
 * bottle — nothing to tell; a cell freed for good stays told.
 */
function cellsOfCopy(copy: Change[], group: Change[]): Change[] {
  const freed = group.filter((change) => change.field === 'slot' && cellKey(change.from) && change.to == null);
  const kept = new Set(copy
    .filter((change) => change.field === 'slot' && change.from == null && cellKey(change.to))
    .map((change) => cellKey(change.to))
    .filter((key) => freed.some((change) => cellKey(change.from) === key)));
  return [
    ...copy.filter((change) => !(change.field === 'slot' && change.from == null && kept.has(cellKey(change.to)))),
    ...freed.filter((change) => !kept.has(cellKey(change.from))),
  ];
}

/** The entry of `logs` nearest in time to `log` matching `match`, written within {@link PAIR_WINDOW_MS}. */
function nearest<L extends HistoryLog>(logs: readonly L[], log: L, match: (other: L) => boolean): L | undefined {
  let best: L | undefined;
  let gap = Infinity;
  for (const other of logs) {
    if (other === log || !match(other)) continue;
    const distance = Math.abs(other.createdAt.getTime() - log.createdAt.getTime());
    if (distance <= PAIR_WINDOW_MS && distance < gap) {
      best = other;
      gap = distance;
    }
  }
  return best;
}

/**
 * Recette #847 (points 6.6, open / drink): one gesture, one entry. A copy
 * taken off a group (opened, drunk, smoked — FEAT-103) is recorded twice,
 * on the copy and on its group ("Quantité : 6 → 5 · Case C4·R1 libérée"):
 * the group's entry is folded into the copy's — its cells freed are told
 * there, a cell the opened copy kept is not told at all. Part of a group
 * moved to another cellar is told on the line the copies went to, but the
 * cells freed were recorded on the group they left: they are told on the
 * move too (both entries stay, point 57). Read-time, so the entries already
 * recorded read the same. `logs`: as read, any order.
 */
export function foldSplitEntries<L extends HistoryLog>(logs: readonly L[]): L[] {
  const folded = new Set<L>();
  const merged = new Map<L, L>();
  /** The group entries of moves whose cells are already told on a move. */
  const told = new Set<L>();
  for (const log of logs) {
    if (folded.has(log)) continue;
    const details = detailsOf(log) as PairDetails;
    let group: L | undefined;
    if (details.outcome === 'detached' && !details.subItemId && details.targetItemId) {
      // The copy detached: its group's entry names it (`subItemId`), or —
      // a guest's write — is the group's own detach entry by the same hand.
      const copy = lineOf(log);
      group = nearest(logs, log, (other) => {
        const theirs = detailsOf(other);
        if (folded.has(other) || merged.has(other) || theirs.outcome !== 'detached' || lineOf(other) !== details.targetItemId) return false;
        return theirs.subItemId ? theirs.subItemId === copy : !theirs.targetItemId && actorOf(other) === actorOf(log);
      });
    } else if (log.action === 'MOVE_UNITS' && details.fromItemId) {
      // The same move: same copies, and a group's entry tells its cells on one move only
      // (1 of 3 moved, then the 2 left within seconds: the second move never says the first one's cells).
      group = nearest(logs, log, (other) => other.action === 'MOVE_UNITS' && !told.has(other)
        && lineOf(other) === details.fromItemId && (detailsOf(other) as PairDetails).toItemId === lineOf(log)
        && (detailsOf(other) as PairDetails).count === details.count);
    }
    if (!group) continue;
    const groupChanges = detailsOf(group).changes ?? [];
    if (log.action === 'MOVE_UNITS') {
      told.add(group);
      // Each line keeps its entry (point 57): the cells are only told again where the move is.
      const freed = groupChanges.filter((change) => change.field === 'slot' && change.to == null);
      if (freed.length > 0) merged.set(log, { ...log, details: { ...details, changes: [...(details.changes ?? []), ...freed] } });
      continue;
    }
    folded.add(group);
    merged.set(log, { ...log, details: { ...details, changes: cellsOfCopy(details.changes ?? [], groupChanges) } });
  }
  return logs.filter((log) => !folded.has(log)).map((log) => merged.get(log) ?? log);
}

/**
 * The gesture an entry records, read from its changes (`smokeOne` marks a
 * cigar smoked since recette #847 — the first cigar of a box only opens it
 * in its changes): a cigar smoked, a copy finished (its level down to 0), a
 * copy opened. Null for anything else (a level adjusted, a bottle closed
 * again, an edit).
 */
export function gestureOf(action: string, details: unknown): HistoryGesture | null {
  if (action !== 'UPDATE' && action !== 'GUEST_UPDATE') return null;
  const { changes = [], smokeOne } = (details ?? {}) as { changes?: Change[]; smokeOne?: unknown };
  const change = (field: string) => changes.find((entry) => entry.field === field);
  if (smokeOne === true) return 'smoked';
  const left = change('cigarsLeft');
  // Recorded before the mark: exactly one cigar fewer in an opened box (a number corrected in the form is not a smoke).
  if (left && typeof left.from === 'number' && typeof left.to === 'number' && left.from - left.to === 1) return 'smoked';
  const level = change('fillLevel');
  if (level && level.to === 0 && level.from !== 0) return 'finished';
  const opened = change('isOpened');
  if (opened && opened.to === true && opened.from !== true) return 'opened';
  return null;
}
