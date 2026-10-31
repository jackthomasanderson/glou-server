import { BottleCategory, Prisma } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../lib/prisma';
import { CorrectionInput, RecordFoundItemInput, StartSessionInput } from '../schemas/inventory-count.schema';
import { inventoryService } from './inventory.service';
import { InventoryInput } from '../schemas/inventory.schema';
import { IN_STOCK_ITEM_FILTER, isFinishedState, isIntactItem } from '../lib/finished-item';
import { lockFamilies } from '../lib/product-fields';
import { moveCountEntry } from '../lib/count-entries';
import { finishUnits } from './stock-state.service';
import { addUnitsIn, correctQuantityIn } from './stock.service';
import { LISTED_PRODUCT_FILTER } from './product.service';
import type { FieldChange } from '../../../shared/product';

/**
 * FEAT-12: Inventaire Physique Assisté & Réconciliation.
 *
 * IMPORTANT — shared inventory, no userId access filter (see design.md
 * invariant: userId = audit only, never an access filter). `userId` on
 * InventoryCountSession and `actingUserId` passed into the correction
 * helpers below are used ONLY to stamp `updatedBy`/audit trails — they are
 * never used to scope a `where` clause on InventoryItem or on the session
 * itself. Every member sees and can act on the same session.
 *
 * Single active session policy: only one InventoryCountSession with status
 * 'active' or 'paused' may exist instance-wide at a time (see
 * `getActiveSessionRow`/`startSession`). This is a deliberate simplification
 * (documented per the implementation brief) — a shared inventory counted by
 * multiple people at once would otherwise require per-item locking to avoid
 * two operators reconciling overlapping scopes concurrently, which is out of
 * scope for v1. `GET /sessions/active` surfaces whichever session (active or
 * paused) currently holds that single slot, so the frontend can either
 * resume it or show it as blocking a new start.
 */

const NON_TERMINAL_STATUSES = ['active', 'paused'] as const;

export interface CountSessionDTO {
  id: string;
  scopeLabel: string;
  cellarId: string | null;
  status: string;
  userId: string;
  startedAt: Date;
  pausedAt: Date | null;
  completedAt: Date | null;
}

const REPORT_ITEM_SELECT = {
  id: true,
  productId: true,
  name: true,
  producer: true,
  category: true,
  vintage: true,
  photoUrl: true,
  cellarId: true,
  quantity: true,
  isOpened: true,
  fillLevel: true,
  cigarsLeft: true,
} satisfies Prisma.InventoryItemSelect;

type ReportItemRow = Prisma.InventoryItemGetPayload<{ select: typeof REPORT_ITEM_SELECT }>;

/** What a count entry says of its line: for a group, the number found. */
type CountedEntry = { foundQuantity: number | null };

/**
 * #471 (FEAT-100, D15): a line of the count — a group of N intact copies,
 * answered with a number, or a single unit (an opened bottle, a box in
 * progress) pointed on its own.
 */
export interface CountLine extends ReportItemRow {
  /** An intact group, counted with "Combien en avez-vous trouvé ?". */
  isGroup: boolean;
  /** Copies the line holds (×6). */
  expectedQuantity: number;
  /** Copies found; null while the line is not pointed. */
  foundQuantity: number | null;
  missingQuantity: number;
  surplusQuantity: number;
}

/**
 * The numbers of a line: expected = its copies; found = the entry's
 * `foundQuantity`, the whole line when the entry has none (a one-tap
 * confirmation, or a count recorded before #471). `foundQuantity` may also
 * have been set by the families transformation on a merged group (F3).
 */
export function countLine(row: ReportItemRow, entry: CountedEntry | undefined): CountLine {
  const expectedQuantity = Math.max(row.quantity ?? 1, 1);
  // Any entry was found somewhere: one recorded elsewhere ('unexpected', the
  // line then moved) is not missing either.
  const foundQuantity = entry ? entry.foundQuantity ?? expectedQuantity : null;
  return {
    ...row,
    isGroup: isIntactItem(row),
    expectedQuantity,
    foundQuantity,
    missingQuantity: Math.max(expectedQuantity - (foundQuantity ?? 0), 0),
    surplusQuantity: Math.max((foundQuantity ?? 0) - expectedQuantity, 0),
  };
}

/** A wine already known that a find of the same name may join (#471, FEAT-100). */
export interface MatchingProduct {
  id: string;
  name: string;
  producer: string;
  vintage: number | null;
}

/** Same normalisation as `productKey` (shared/units.ts). */
const normalizeName = (value: string) => value.trim().toLowerCase();

/**
 * `itemId` is null for a physical find with no match anywhere in the system
 * yet (the "ajouter au stock" case, see the InventoryCountEntry model
 * comment in schema.prisma) — `name`/`producer`/`category`/`vintage`/
 * `photoUrl`/`cellarId` then fall back to the entry's captured
 * `newItemName`/`newItemCategory` instead of a real InventoryItem's fields.
 * `entryId` is always present: it's what a 'add_to_stock' correction
 * targets (there's no `itemId` to target yet).
 */
export interface CountUnexpectedItem {
  entryId: string;
  itemId: string | null;
  name: string;
  producer: string | null;
  category: BottleCategory;
  vintage: number | null;
  photoUrl: string | null;
  cellarId: string | null;
  quantity: number | null;
  scannedAt: Date;
  /** For a new find: the known wines of the same category and name (empty otherwise). */
  matchingProducts: MatchingProduct[];
}

/**
 * #471 (FEAT-100): `expected` is the theoretical list, one line per group;
 * `missing` and `surplus` the lines whose number found is below / above it.
 * The counts are in copies (bottles, boxes, cigars), not lines; `unexpected`
 * counts the finds.
 */
export interface SessionReport {
  session: CountSessionDTO;
  expected: CountLine[];
  confirmed: CountLine[];
  missing: CountLine[];
  surplus: CountLine[];
  unexpected: CountUnexpectedItem[];
  counts: {
    expected: number;
    confirmed: number;
    missing: number;
    surplus: number;
    unexpected: number;
  };
}

export interface SkippedCorrection {
  targetId: string;
  action: string;
  reason:
    | 'item_not_found' | 'session_has_no_cellar' | 'entry_not_found' | 'not_a_group' | 'nothing_to_correct'
    | 'product_not_found' | 'category_mismatch';
}

/**
 * A line of history to write once the corrections are committed (#471): the
 * group's number before and after (−k drunk or corrected, +k added), on the
 * group itself, and each finished copy on its own.
 */
export interface CountHistoryEntry {
  action: 'UPDATE' | 'CREATE' | 'ADD_UNITS' | 'CORRECT_QUANTITY';
  itemId: string;
  productId: string;
  details: Record<string, unknown> & { changes?: FieldChange[] };
}

// Row type inferred from the Prisma client (same pattern as inventory.service.ts).
type SessionRow = Awaited<ReturnType<typeof prisma.inventoryCountSession.findFirst>> extends infer T | null
  ? NonNullable<T>
  : never;

function toSessionDTO(row: SessionRow): CountSessionDTO {
  return {
    id: row.id,
    scopeLabel: row.scopeLabel,
    cellarId: row.cellarId,
    status: row.status,
    userId: row.userId,
    startedAt: row.startedAt,
    pausedAt: row.pausedAt,
    completedAt: row.completedAt,
  };
}

async function getActiveSessionRow(): Promise<SessionRow | null> {
  return prisma.inventoryCountSession.findFirst({
    where: { status: { in: [...NON_TERMINAL_STATUSES] } },
    orderBy: { startedAt: 'desc' },
  });
}

// ─── Read: active/in-progress session ────────────────────────────────────────

export async function getActiveSession(): Promise<CountSessionDTO | null> {
  const row = await getActiveSessionRow();
  return row ? toSessionDTO(row) : null;
}

// ─── Start ────────────────────────────────────────────────────────────────────

export type StartSessionResult =
  | { status: 'success'; session: CountSessionDTO }
  | { status: 'conflict'; session: CountSessionDTO }
  | { status: 'cellar_not_found' };

export async function startSession(userId: string, input: StartSessionInput): Promise<StartSessionResult> {
  const existing = await getActiveSessionRow();
  if (existing) {
    return { status: 'conflict', session: toSessionDTO(existing) };
  }

  if (input.cellarId) {
    // Not userId-filtered — cellars are shared instance data (design.md).
    const cellar = await prisma.cellar.findFirst({ where: { id: input.cellarId } });
    if (!cellar) return { status: 'cellar_not_found' };
  }

  try {
    const session = await prisma.inventoryCountSession.create({
      data: {
        scopeLabel: input.scopeLabel,
        cellarId: input.cellarId ?? null,
        status: 'active',
        userId,
      },
    });

    return { status: 'success', session: toSessionDTO(session) };
  } catch (err) {
    // #173: the `getActiveSessionRow` check above closes almost every
    // window, but the database's partial unique index is the actual
    // guarantee — two concurrent starts can both pass that check, and the
    // loser here gets the same clean conflict response instead of a 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const concurrent = await getActiveSessionRow();
      if (concurrent) return { status: 'conflict', session: toSessionDTO(concurrent) };
    }
    throw err;
  }
}

// ─── Pause / Resume ───────────────────────────────────────────────────────────

export type SessionTransitionResult =
  | { status: 'success'; session: CountSessionDTO }
  | { status: 'not_found' }
  | { status: 'invalid_state' };

export async function pauseSession(sessionId: string): Promise<SessionTransitionResult> {
  const session = await prisma.inventoryCountSession.findUnique({ where: { id: sessionId } });
  if (!session) return { status: 'not_found' };
  if (session.status !== 'active') return { status: 'invalid_state' };

  const updated = await prisma.inventoryCountSession.update({
    where: { id: sessionId },
    data: { status: 'paused', pausedAt: new Date() },
  });
  return { status: 'success', session: toSessionDTO(updated) };
}

/**
 * Resumes a paused session. All previously recorded InventoryCountEntry rows
 * are left untouched (they're never deleted on pause), so the resumed
 * session shows exactly the same confirmed/unexpected state the user left —
 * "reprendre exactement là où il s'était arrêté" (feature.md).
 */
export async function resumeSession(sessionId: string): Promise<SessionTransitionResult> {
  const session = await prisma.inventoryCountSession.findUnique({ where: { id: sessionId } });
  if (!session) return { status: 'not_found' };
  if (session.status !== 'paused') return { status: 'invalid_state' };

  const updated = await prisma.inventoryCountSession.update({
    where: { id: sessionId },
    data: { status: 'active', pausedAt: null },
  });
  return { status: 'success', session: toSessionDTO(updated) };
}

// ─── Scan / tap-to-confirm ────────────────────────────────────────────────────

export type RecordScanResult =
  | { status: 'success'; entry: { id: string; itemId: string; entryStatus: string; scannedAt: Date } }
  | { status: 'session_not_found' }
  | { status: 'session_not_active' }
  | { status: 'item_not_found' };

/**
 * Records that an item was found during the session. Auto-determines
 * confirmed vs unexpected from the item's CURRENT cellarId vs. the session's
 * scope cellarId — a session with no cellarId (free-label scope like "Bac 3"
 * with no structured Cellar reference) has nothing to compare against, so
 * every scan in that mode is treated as 'confirmed' (see file header +
 * getSessionReport: the theoretical list is empty in that case too).
 */
export async function recordScan(sessionId: string, itemId: string, foundQuantity?: number): Promise<RecordScanResult> {
  const session = await prisma.inventoryCountSession.findUnique({ where: { id: sessionId } });
  if (!session) return { status: 'session_not_found' };
  if (session.status !== 'active') return { status: 'session_not_active' };

  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null } });
  if (!item) return { status: 'item_not_found' };

  const matchesScope = session.cellarId == null ? true : item.cellarId === session.cellarId;
  const entryStatus: 'confirmed' | 'unexpected' = matchesScope ? 'confirmed' : 'unexpected';

  const entry = await prisma.inventoryCountEntry.upsert({
    where: { sessionId_itemId: { sessionId, itemId } },
    create: { sessionId, itemId, status: entryStatus, foundQuantity: foundQuantity ?? null },
    update: { status: entryStatus, foundQuantity: foundQuantity ?? null, scannedAt: new Date() },
  });

  return {
    status: 'success',
    // `entry.itemId` is always non-null here — this path (recordScan) only
    // ever creates/updates entries against a real, already-resolved item
    // (see recordUnlistedFind below for the itemId-null "add_to_stock" path).
    entry: { id: entry.id, itemId: entry.itemId!, entryStatus: entry.status, scannedAt: entry.scannedAt },
  };
}

// ─── Unlisted find ("ajouter au stock") ────────────────────────────────────────

export type RecordUnlistedFindResult =
  | { status: 'success'; entryId: string }
  | { status: 'session_not_found' }
  | { status: 'session_not_active' };

/**
 * Records a physical find that matches NO existing InventoryItem — the third
 * corrective action promised by feature.md ("ajouter au stock") but
 * previously impossible to record at all, since InventoryCountEntry.itemId
 * used to be NOT NULL. Always filed as 'unexpected' (it's by definition not
 * on the theoretical list) with no itemId; the InventoryItem itself is only
 * created later, at closure, if the operator confirms the 'add_to_stock'
 * correction (see applyCorrectionsInternal below) — recording the find here
 * is just "I saw this physically", not yet "add it to the shared inventory".
 */
export async function recordUnlistedFind(
  sessionId: string,
  input: RecordFoundItemInput,
): Promise<RecordUnlistedFindResult> {
  const session = await prisma.inventoryCountSession.findUnique({ where: { id: sessionId } });
  if (!session) return { status: 'session_not_found' };
  if (session.status !== 'active') return { status: 'session_not_active' };

  const entry = await prisma.inventoryCountEntry.create({
    data: {
      sessionId,
      itemId: null,
      status: 'unexpected',
      newItemName: input.name,
      newItemCategory: input.category,
      newItemQuantity: input.quantity ?? null,
    },
  });

  return { status: 'success', entryId: entry.id };
}

// ─── Report ───────────────────────────────────────────────────────────────────

/**
 * Theoretical/expected list + confirmed/missing/unexpected breakdown.
 * "Missing" is deliberately NOT persisted anywhere — it's computed here as
 * (theoretical list) minus (confirmed entries) every time the report is
 * requested, so it can never drift out of sync with live inventory changes
 * (an item deleted, moved, or added to the cellar mid-session).
 */
export async function getSessionReport(sessionId: string): Promise<SessionReport | null> {
  const session = await prisma.inventoryCountSession.findUnique({ where: { id: sessionId } });
  if (!session) return null;

  const [theoretical, entries] = await Promise.all([
    session.cellarId
      ? prisma.inventoryItem.findMany({
          // FEAT-87: a reference is not on any shelf, so it is never part
          // of what a count session has to find. #573: nor is a finished
          // bottle — otherwise "Mark as consumed" below could never take a
          // missing bottle off the list.
          where: { cellarId: session.cellarId, ...IN_STOCK_ITEM_FILTER },
          select: REPORT_ITEM_SELECT,
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([] as ReportItemRow[]),
    // `OR: [{ itemId: null }, ...]` is required so unlisted finds (itemId
    // null, "add_to_stock" candidates) aren't dropped: Prisma's relation
    // filter on an optional to-one (`item: { deletedAt: null }`) excludes
    // rows where the relation itself is null, same as an inner join.
    prisma.inventoryCountEntry.findMany({
      where: { sessionId, OR: [{ itemId: null }, { item: { deletedAt: null } }] },
      include: { item: { select: REPORT_ITEM_SELECT } },
      orderBy: { scannedAt: 'desc' },
    }),
  ]);

  // 'confirmed' entries always carry an item (only recordScan, never
  // recordUnlistedFind, ever sets status: 'confirmed') — the extra null
  // filter is just to satisfy the nullable-relation type from Prisma.
  const entryByItem = new Map(entries.flatMap((e) => (e.itemId ? [[e.itemId, e] as const] : [])));
  const expected = theoretical.map((row) => countLine(row, entryByItem.get(row.id)));
  const confirmed = entries
    .filter((e) => e.status === 'confirmed' && e.item !== null)
    .map((e) => countLine(e.item as ReportItemRow, e))
    // "None found" is an answer, not a confirmation.
    .filter((line) => line.foundQuantity !== 0);

  const newFinds = entries.filter((e) => e.status === 'unexpected' && !e.item && e.newItemName && e.newItemCategory);
  const matching = await matchingProductsFor(
    newFinds.map((e) => ({ name: e.newItemName!, category: e.newItemCategory! })),
  );

  const unexpected: CountUnexpectedItem[] = entries
    .filter((e) => e.status === 'unexpected')
    .map((e) =>
      e.item
        ? {
            entryId: e.id,
            itemId: e.item.id,
            name: e.item.name,
            producer: e.item.producer,
            category: e.item.category,
            vintage: e.item.vintage,
            photoUrl: e.item.photoUrl,
            cellarId: e.item.cellarId,
            quantity: e.foundQuantity,
            scannedAt: e.scannedAt,
            matchingProducts: [],
          }
        : {
            entryId: e.id,
            itemId: null,
            // Guaranteed set together by recordUnlistedFind whenever itemId
            // is null — see the InventoryCountEntry comment in schema.prisma.
            name: e.newItemName!,
            producer: null,
            category: e.newItemCategory!,
            vintage: null,
            photoUrl: null,
            cellarId: null,
            quantity: e.newItemQuantity,
            scannedAt: e.scannedAt,
            matchingProducts: matching.get(`${e.newItemCategory}:${normalizeName(e.newItemName!)}`) ?? [],
          },
    );

  const missing = expected.filter((line) => line.missingQuantity > 0);
  const surplus = expected.filter((line) => line.surplusQuantity > 0);
  const sum = (lines: CountLine[], pick: (line: CountLine) => number) => lines.reduce((total, line) => total + pick(line), 0);

  return {
    session: toSessionDTO(session),
    expected,
    confirmed,
    missing,
    surplus,
    unexpected,
    counts: {
      expected: sum(expected, (line) => line.expectedQuantity),
      confirmed: sum(confirmed, (line) => Math.min(line.foundQuantity ?? 0, line.expectedQuantity)),
      missing: sum(missing, (line) => line.missingQuantity),
      surplus: sum(surplus, (line) => line.surplusQuantity),
      unexpected: unexpected.length,
    },
  };
}

/** Known wines proposed per find, at most. */
const MAX_MATCHES_PER_FIND = 5;

/**
 * #471 (FEAT-100): the wines already known that a find may join — same
 * category, same name once normalized (the producer and the year of a find
 * are not captured, so the member picks). Listed families only: a family in
 * the trash cannot take new copies.
 */
async function matchingProductsFor(
  finds: { name: string; category: BottleCategory }[],
): Promise<Map<string, MatchingProduct[]>> {
  const matches = new Map<string, MatchingProduct[]>();
  if (finds.length === 0) return matches;
  const products = await prisma.product.findMany({
    where: {
      ...LISTED_PRODUCT_FILTER,
      AND: [{ OR: finds.map((find) => ({ category: find.category, name: { equals: find.name.trim(), mode: 'insensitive' as const } })) }],
    },
    select: { id: true, name: true, producer: true, vintage: true, category: true },
    orderBy: [{ name: 'asc' }, { producer: 'asc' }, { id: 'asc' }],
  });
  for (const { category, ...product } of products) {
    const key = `${category}:${normalizeName(product.name)}`;
    const list = matches.get(key) ?? [];
    if (list.length < MAX_MATCHES_PER_FIND) matches.set(key, [...list, product]);
  }
  return matches;
}

// ─── Corrective actions (applied at closure) ─────────────────────────────────

/**
 * Builds the InventoryInput for a newly-confirmed "ajouter au stock" find.
 * Mirrors import.service.ts#toInventoryInput's pattern exactly (per-category
 * switch + safe placeholder defaults for fields the capture flow doesn't
 * collect) for consistency — only name/category/quantity come from the
 * count session (feature.md); everything else is left as an editable
 * placeholder, same spirit as the CSV import's `alcoholDegree: 0`.
 * #471 (FEAT-100): the copies found form one group (a find of six bottles is
 * a group ×6), whatever the category.
 */
function toInventoryInputForFound(
  entry: { newItemName: string; newItemCategory: BottleCategory; newItemQuantity: number | null },
  cellarId: string | null,
): InventoryInput {
  const common = {
    name: entry.newItemName,
    producer: '',
    tags: [] as string[],
    isOwned: true,
    isOpened: false,
    alertStatus: 'none' as const,
    cellarId,
    lockedFields: [] as string[],
    // Every category's unit carries a number of copies; only the cigar's
    // input declares it so far (lot E1 adds it to the others).
    quantity: entry.newItemQuantity ?? 1,
  };

  switch (entry.newItemCategory) {
    case 'wine':
      return { ...common, category: 'wine' as const, grapeVarieties: [] as string[] };
    case 'sparkling':
      return { ...common, category: 'sparkling' as const };
    case 'spirit':
      return { ...common, category: 'spirit' as const, alcoholDegree: 0 };
    case 'cigar':
      // Single cigars (no `cigarsPerBox`): a find is counted cigar by cigar.
      return { ...common, category: 'cigar' as const };
  }
}

/**
 * Shared implementation used by both the standalone `applyCorrections` and
 * `completeSession` (which must apply corrections AND flip the session
 * status atomically) — accepts a Prisma transaction client so both callers
 * can wrap it in their own `$transaction` without nesting interactive
 * transactions, mirroring the `purgeOldAuditLogs(days, client)` pattern
 * already used in audit.service.ts.
 *
 * Each correction is applied independently and mechanically: this helper
 * does not re-derive the reconciliation report to check that e.g. a
 * 'mark_consumed' item was actually in the 'missing' bucket. The report is
 * what informs the frontend's suggested actions, but by the time the user
 * confirms them the underlying data may have shifted slightly (another
 * member edited the item); re-validating bucket membership here would add
 * complexity for a low-value, self-correcting guard (worst case: an action
 * is applied to an item that's no longer in the exact bucket the UI showed,
 * which is a normal race in a shared inventory, not a data-integrity risk).
 */
async function applyCorrectionsInternal(
  tx: PrismaTransactionClient,
  session: { id: string; cellarId: string | null },
  corrections: CorrectionInput[],
  actingUserId: string,
): Promise<CorrectionsOutcome> {
  let appliedCount = 0;
  const skipped: SkippedCorrection[] = [];
  const history: CountHistoryEntry[] = [];
  const skip = (targetId: string, action: string, reason: SkippedCorrection['reason']) => {
    skipped.push({ targetId, action, reason });
  };

  // #471: the locking rule — every family written (those of the units
  // corrected, those a find joins), in sorted order, before any unit is
  // written.
  const itemIds = corrections.flatMap((correction) => (correction.action === 'add_to_stock' ? [] : [correction.itemId]));
  const units = itemIds.length > 0
    ? await tx.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { productId: true } })
    : [];
  const joined = corrections.flatMap((correction) => (correction.action === 'add_to_stock' && correction.productId ? [correction.productId] : []));
  await lockFamilies(tx, [...units.map((unit) => unit.productId), ...joined]);

  // The answers of the count: the default number of copies a group's
  // correction applies to (#471, FEAT-100, D15).
  const entries = itemIds.length > 0
    ? await tx.inventoryCountEntry.findMany({ where: { sessionId: session.id, itemId: { in: itemIds } } })
    : [];
  const entryByItem = new Map(entries.map((entry) => [entry.itemId, entry]));

  for (const correction of corrections) {
    if (correction.action === 'add_to_stock') {
      const entry = await tx.inventoryCountEntry.findUnique({ where: { id: correction.entryId } });
      // Must belong to this session, still be an unresolved find (itemId
      // null), and carry the invariant newItem* fields set by
      // recordUnlistedFind — anything else is either a stale/bad entryId or
      // an entry that was already resolved by an earlier correction.
      if (
        !entry ||
        entry.sessionId !== session.id ||
        entry.itemId !== null ||
        !entry.newItemName ||
        !entry.newItemCategory
      ) {
        skip(correction.entryId, correction.action, 'entry_not_found');
        continue;
      }

      const count = entry.newItemQuantity ?? 1;
      if (correction.productId) {
        // #471 (FEAT-100): a find of a wine already known completes its
        // group in this cellar, or forms a new line of it — never a second
        // card. Purchase day and price are not known for a find.
        const listed = await tx.product.findFirst({ where: { id: correction.productId, ...LISTED_PRODUCT_FILTER }, select: { id: true, category: true } });
        if (!listed) {
          skip(correction.entryId, correction.action, 'product_not_found');
          continue;
        }
        if (listed.category !== entry.newItemCategory) {
          skip(correction.entryId, correction.action, 'category_mismatch');
          continue;
        }
        const added = await addUnitsIn(tx, actingUserId, correction.productId, {
          quantity: count,
          cellarId: session.cellarId,
          purchasedAt: null,
        });
        // The find's copies were found: when they complete a group, the
        // group's entry in this session (if any) counts them too — one entry
        // per line and session — else the entry counts just them.
        await moveCountEntry(tx, entry, count, { id: added.result.data.id, quantityBefore: added.from ?? 0 }, 'confirmed');
        history.push({
          action: 'ADD_UNITS',
          itemId: added.result.data.id,
          productId: correction.productId,
          details: { scope: 'inventory-count', sessionId: session.id, merged: added.merged, changes: [{ field: 'quantity', from: added.from, to: added.to }] },
        });
        appliedCount++;
        continue;
      }

      const created = await inventoryService.createItem(
        actingUserId,
        toInventoryInputForFound(
          { newItemName: entry.newItemName, newItemCategory: entry.newItemCategory, newItemQuantity: entry.newItemQuantity },
          session.cellarId,
        ),
        tx,
      );
      await tx.inventoryCountEntry.update({ where: { id: entry.id }, data: { itemId: created.id } });
      history.push({
        action: 'CREATE',
        itemId: created.id,
        productId: created.productId,
        details: { scope: 'inventory-count', sessionId: session.id, changes: [{ field: 'quantity', from: null, to: count }] },
      });
      appliedCount++;
      continue;
    }

    const item = await tx.inventoryItem.findFirst({ where: { id: correction.itemId, deletedAt: null } });
    if (!item) {
      skip(correction.itemId, correction.action, 'item_not_found');
      continue;
    }
    const line = countLine(item, entryByItem.get(item.id));
    const base = { scope: 'inventory-count', sessionId: session.id };

    if (correction.action === 'mark_consumed') {
      // Same semantics as the existing FEAT-77 stock-update flow (see
      // consumption-plan.service.ts header): isOpened=true, fillLevel=0, and
      // the bottle gives its grid slot back (#573, see lib/finished-item.ts).
      //
      // `lockedFields` is deliberately NOT consulted: closing a count session
      // is an explicit user decision, and the lock only exists to stop a later
      // *automated* pass from overwriting a manual value (see
      // inventory.service.ts#updateItem). Honouring it here made the
      // correction a silent no-op on every bottle whose level had once been
      // adjusted by hand, so those items came back as "missing" at every
      // subsequent count (ISSUE_034).
      //
      // #471 (FEAT-100, FEAT-103): only the missing copies of a group are
      // finished, each one through the detach rule (a finished sub-record,
      // the last one the group itself), so the spending keeps them and a
      // group never carries a state. The slot goes with the last one.
      const count = Math.min(correction.count ?? line.missingQuantity, line.expectedQuantity);
      if (count < 1 || item.writtenOffAt != null || isFinishedState(item)) {
        skip(item.id, correction.action, 'nothing_to_correct');
        continue;
      }
      const finished = await finishUnits(tx, item.id, count, { userId: actingUserId });
      const from = line.expectedQuantity;
      const to = from - finished.length;
      // The group's own history: k copies fewer — unless the last one was
      // the group itself, which then records its own finish below.
      if (to > 0) {
        history.push({ action: 'UPDATE', itemId: item.id, productId: item.productId, details: { ...base, changes: [{ field: 'quantity', from, to }], finishedItemIds: finished } });
      }
      for (const finishedId of finished) {
        history.push({
          action: 'UPDATE',
          itemId: finishedId,
          productId: item.productId,
          details: { ...base, changes: [{ field: 'fillLevel', from: item.fillLevel, to: 0 }], ...(finishedId === item.id ? {} : { outcome: 'detached', groupItemId: item.id }) },
        });
      }
      appliedCount++;
      continue;
    }

    if (correction.action === 'correct_quantity') {
      // #471 (FEAT-100, FEAT-92): "Corriger le nombre" of a group, by its
      // missing copies, with its reason. An opened bottle has no number.
      if (!line.isGroup || !item.isOwned) {
        skip(item.id, correction.action, 'not_a_group');
        continue;
      }
      const count = Math.min(correction.count ?? line.missingQuantity, line.expectedQuantity);
      const quantity = line.expectedQuantity - count;
      // An input error never takes a group below one: the trash is for the whole line.
      if (count < 1 || (correction.reason === 'input_error' && quantity < 1)) {
        skip(item.id, correction.action, 'nothing_to_correct');
        continue;
      }
      const corrected = await correctQuantityIn(tx, actingUserId, item.id, item.productId, { quantity, reason: correction.reason });
      if (!corrected || 'conflict' in corrected) {
        skip(item.id, correction.action, 'item_not_found');
        continue;
      }
      history.push({
        action: 'CORRECT_QUANTITY',
        itemId: item.id,
        productId: item.productId,
        details: { ...base, reason: correction.reason, changes: corrected.changes, writtenOffItemId: corrected.writtenOffItemId },
      });
      appliedCount++;
      continue;
    }

    if (correction.action === 'add_units') {
      // #471 (FEAT-100): copies found in excess complete the line's group —
      // the line itself when it is a group (same cellar, price, size and
      // purchase day, D5), else the group it would join, or a new line.
      const count = correction.count ?? line.surplusQuantity;
      if (count < 1) {
        skip(item.id, correction.action, 'nothing_to_correct');
        continue;
      }
      const added = await addUnitsIn(tx, actingUserId, item.productId, {
        quantity: count,
        cellarId: item.cellarId,
        purchasePrice: item.purchasePrice,
        purchasedAt: item.purchasedAt ? item.purchasedAt.toISOString().slice(0, 10) : null,
        bottleSize: item.bottleSize,
        cigarsPerBox: item.cigarsPerBox,
      });
      history.push({
        action: 'ADD_UNITS',
        itemId: added.result.data.id,
        productId: item.productId,
        details: { ...base, merged: added.merged, changes: [{ field: 'quantity', from: added.from, to: added.to }] },
      });
      appliedCount++;
      continue;
    }

    // move_to_scope
    if (!session.cellarId) {
      skip(correction.itemId, correction.action, 'session_has_no_cellar');
      continue;
    }
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { cellarId: session.cellarId, updatedAt: new Date(), updatedBy: actingUserId },
    });
    appliedCount++;
  }

  return { appliedCount, skipped, history };
}

interface CorrectionsOutcome {
  appliedCount: number;
  skipped: SkippedCorrection[];
  /** Written by the caller once the transaction is committed. */
  history: CountHistoryEntry[];
}

export type ApplyCorrectionsResult =
  | ({ status: 'success' } & CorrectionsOutcome)
  | { status: 'not_found' };

export async function applyCorrections(
  sessionId: string,
  corrections: CorrectionInput[],
  actingUserId: string,
): Promise<ApplyCorrectionsResult> {
  const session = await prisma.inventoryCountSession.findUnique({ where: { id: sessionId } });
  if (!session) return { status: 'not_found' };

  const result = await prisma.$transaction(
    (tx) => applyCorrectionsInternal(tx, session, corrections, actingUserId),
    { timeout: 60000, maxWait: 10000 },
  );
  return { status: 'success', ...result };
}

// ─── Complete ─────────────────────────────────────────────────────────────────

export type CompleteSessionResult =
  | ({ status: 'success'; session: CountSessionDTO } & CorrectionsOutcome)
  | { status: 'not_found' }
  | { status: 'already_completed' };

/**
 * Closes the session: applies the operator's chosen corrections and flips
 * the session to 'completed' inside a single `$transaction`, so a failure
 * partway through never leaves the session completed with only some
 * corrections applied (or vice versa).
 */
export async function completeSession(
  sessionId: string,
  corrections: CorrectionInput[],
  actingUserId: string,
): Promise<CompleteSessionResult> {
  const session = await prisma.inventoryCountSession.findUnique({ where: { id: sessionId } });
  if (!session) return { status: 'not_found' };
  if (session.status === 'completed') return { status: 'already_completed' };

  const result = await prisma.$transaction(async (tx) => {
    // Taken first, in the same transaction: a second closure sent meanwhile
    // (double tap, two members) finds the session completed and applies
    // nothing twice.
    const taken = await tx.inventoryCountSession.updateMany({
      where: { id: sessionId, status: { not: 'completed' } },
      data: { status: 'completed', completedAt: new Date() },
    });
    if (taken.count === 0) return null;
    const corrResult = await applyCorrectionsInternal(tx, session, corrections, actingUserId);
    const updated = await tx.inventoryCountSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { session: updated, ...corrResult };
  }, { timeout: 60000, maxWait: 10000 });
  if (!result) return { status: 'already_completed' };

  return {
    status: 'success',
    session: toSessionDTO(result.session),
    appliedCount: result.appliedCount,
    skipped: result.skipped,
    history: result.history,
  };
}
