import { BottleCategory, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CorrectionInput, RecordFoundItemInput, StartSessionInput } from '../schemas/inventory-count.schema';
import { inventoryService } from './inventory.service';
import { InventoryInput } from '../schemas/inventory.schema';

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
  name: true,
  producer: true,
  category: true,
  vintage: true,
  photoUrl: true,
  cellarId: true,
} satisfies Prisma.InventoryItemSelect;

type ReportItemRow = Prisma.InventoryItemGetPayload<{ select: typeof REPORT_ITEM_SELECT }>;

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
}

export interface SessionReport {
  session: CountSessionDTO;
  confirmed: ReportItemRow[];
  missing: ReportItemRow[];
  unexpected: CountUnexpectedItem[];
  counts: {
    expected: number;
    confirmed: number;
    missing: number;
    unexpected: number;
  };
}

export interface SkippedCorrection {
  targetId: string;
  action: string;
  reason: 'item_not_found' | 'fields_locked' | 'field_locked' | 'session_has_no_cellar' | 'entry_not_found';
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

  const session = await prisma.inventoryCountSession.create({
    data: {
      scopeLabel: input.scopeLabel,
      cellarId: input.cellarId ?? null,
      status: 'active',
      userId,
    },
  });

  return { status: 'success', session: toSessionDTO(session) };
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
export async function recordScan(sessionId: string, itemId: string): Promise<RecordScanResult> {
  const session = await prisma.inventoryCountSession.findUnique({ where: { id: sessionId } });
  if (!session) return { status: 'session_not_found' };
  if (session.status !== 'active') return { status: 'session_not_active' };

  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null } });
  if (!item) return { status: 'item_not_found' };

  const matchesScope = session.cellarId == null ? true : item.cellarId === session.cellarId;
  const entryStatus: 'confirmed' | 'unexpected' = matchesScope ? 'confirmed' : 'unexpected';

  const entry = await prisma.inventoryCountEntry.upsert({
    where: { sessionId_itemId: { sessionId, itemId } },
    create: { sessionId, itemId, status: entryStatus },
    update: { status: entryStatus, scannedAt: new Date() },
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
          where: { cellarId: session.cellarId, deletedAt: null },
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
  const confirmed = entries
    .filter((e) => e.status === 'confirmed')
    .map((e) => e.item)
    .filter((item): item is ReportItemRow => item !== null);

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
            quantity: null,
            scannedAt: e.scannedAt,
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
          },
    );

  const confirmedIds = new Set(confirmed.map((i) => i.id));
  const missing = theoretical.filter((i) => !confirmedIds.has(i.id));

  return {
    session: toSessionDTO(session),
    confirmed,
    missing,
    unexpected,
    counts: {
      expected: theoretical.length,
      confirmed: confirmed.length,
      missing: missing.length,
      unexpected: unexpected.length,
    },
  };
}

// ─── Corrective actions (applied at closure) ─────────────────────────────────

/**
 * Builds the InventoryInput for a newly-confirmed "ajouter au stock" find.
 * Mirrors import.service.ts#toInventoryInput's pattern exactly (per-category
 * switch + safe placeholder defaults for fields the capture flow doesn't
 * collect) for consistency — only name/category/quantity come from the
 * count session (feature.md); everything else is left as an editable
 * placeholder, same spirit as the CSV import's `alcoholDegree: 0`.
 */
function toInventoryInputForFound(
  entry: { newItemName: string; newItemCategory: BottleCategory; newItemQuantity: number | null },
  cellarId: string | null,
): InventoryInput {
  const common = {
    name: entry.newItemName,
    producer: '',
    tags: [] as string[],
    isOpened: false,
    alertStatus: 'none' as const,
    cellarId,
    lockedFields: [] as string[],
  };

  switch (entry.newItemCategory) {
    case 'wine':
      return { ...common, category: 'wine' as const, grapeVarieties: [] as string[] };
    case 'sparkling':
      return { ...common, category: 'sparkling' as const };
    case 'spirit':
      return { ...common, category: 'spirit' as const, alcoholDegree: 0 };
    case 'cigar':
      // The only category InventoryItem models a quantity (box count) on
      // directly — other categories represent each physical unit as its own
      // row, so a captured quantity > 1 there stays informational only.
      return { ...common, category: 'cigar' as const, quantity: entry.newItemQuantity ?? 1 };
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
  tx: Prisma.TransactionClient,
  session: { id: string; cellarId: string | null },
  corrections: CorrectionInput[],
  actingUserId: string,
): Promise<{ appliedCount: number; skipped: SkippedCorrection[] }> {
  let appliedCount = 0;
  const skipped: SkippedCorrection[] = [];

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
        skipped.push({ targetId: correction.entryId, action: correction.action, reason: 'entry_not_found' });
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
      appliedCount++;
      continue;
    }

    const item = await tx.inventoryItem.findFirst({ where: { id: correction.itemId, deletedAt: null } });
    if (!item) {
      skipped.push({ targetId: correction.itemId, action: correction.action, reason: 'item_not_found' });
      continue;
    }

    if (correction.action === 'mark_consumed') {
      // Same semantics as the existing FEAT-77 stock-update flow (see
      // consumption-plan.service.ts header): isOpened=true, fillLevel=0.
      const patch: Prisma.InventoryItemUpdateInput = {};
      if (!item.lockedFields.includes('isOpened')) patch.isOpened = true;
      if (!item.lockedFields.includes('fillLevel')) patch.fillLevel = 0;
      if (Object.keys(patch).length === 0) {
        skipped.push({ targetId: correction.itemId, action: correction.action, reason: 'fields_locked' });
        continue;
      }
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { ...patch, updatedAt: new Date(), updatedBy: actingUserId },
      });
      appliedCount++;
      continue;
    }

    // move_to_scope
    if (!session.cellarId) {
      skipped.push({ targetId: correction.itemId, action: correction.action, reason: 'session_has_no_cellar' });
      continue;
    }
    if (item.lockedFields.includes('cellarId')) {
      skipped.push({ targetId: correction.itemId, action: correction.action, reason: 'field_locked' });
      continue;
    }
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { cellarId: session.cellarId, updatedAt: new Date(), updatedBy: actingUserId },
    });
    appliedCount++;
  }

  return { appliedCount, skipped };
}

export type ApplyCorrectionsResult =
  | { status: 'success'; appliedCount: number; skipped: SkippedCorrection[] }
  | { status: 'not_found' };

export async function applyCorrections(
  sessionId: string,
  corrections: CorrectionInput[],
  actingUserId: string,
): Promise<ApplyCorrectionsResult> {
  const session = await prisma.inventoryCountSession.findUnique({ where: { id: sessionId } });
  if (!session) return { status: 'not_found' };

  const result = await prisma.$transaction((tx) => applyCorrectionsInternal(tx, session, corrections, actingUserId));
  return { status: 'success', ...result };
}

// ─── Complete ─────────────────────────────────────────────────────────────────

export type CompleteSessionResult =
  | { status: 'success'; session: CountSessionDTO; appliedCount: number; skipped: SkippedCorrection[] }
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
    const corrResult = await applyCorrectionsInternal(tx, session, corrections, actingUserId);
    const updated = await tx.inventoryCountSession.update({
      where: { id: sessionId },
      data: { status: 'completed', completedAt: new Date() },
    });
    return { session: updated, ...corrResult };
  });

  return {
    status: 'success',
    session: toSessionDTO(result.session),
    appliedCount: result.appliedCount,
    skipped: result.skipped,
  };
}
