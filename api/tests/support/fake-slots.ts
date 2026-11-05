import { vi } from 'vitest';

// FEAT-93: an in-memory stand-in for `tx.itemSlot` (the `item_slots` table),
// for the services' fake transaction clients. It answers the filters
// lib/slots.ts and slot.service.ts use: equalities, `in`, `not`, and
// `deletedAt: null` / `{ not: null }`, and orders live slots the way
// `liveSlotsOf` asks (most recently placed first).

export interface FakeSlot {
  id: string;
  itemId: string;
  cellarId: string;
  column: number;
  row: number;
  deletedAt: Date | null;
  createdAt: Date;
}

type Where = Record<string, unknown>;

const matches = (row: FakeSlot, where: Where = {}): boolean =>
  Object.entries(where).every(([field, value]) => {
    const actual = (row as unknown as Record<string, unknown>)[field];
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      const op = value as { in?: unknown[]; not?: unknown };
      if ('in' in op) return op.in!.includes(actual);
      if ('not' in op) return op.not === null ? actual != null : actual !== op.not;
    }
    return value === null ? actual == null : actual === value;
  });

const byOrder = (orderBy: unknown) => (a: FakeSlot, b: FakeSlot): number => {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Array<Record<string, 'asc' | 'desc'>>;
  for (const key of keys) {
    const [field, direction] = Object.entries(key)[0];
    const x = (a as unknown as Record<string, number | string | Date>)[field];
    const y = (b as unknown as Record<string, number | string | Date>)[field];
    const cmp = x < y ? -1 : x > y ? 1 : 0;
    if (cmp !== 0) return direction === 'desc' ? -cmp : cmp;
  }
  return 0;
};

const pick = (row: FakeSlot, select?: Record<string, boolean>) =>
  select ? Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, (row as unknown as Record<string, unknown>)[key]])) : { ...row };

let next = 0;

/** A slot row; `createdAt` increases with each one made, so the last placed is the most recent. */
export function slot(fields: Partial<FakeSlot> & { itemId: string; column: number; row: number }): FakeSlot {
  next += 1;
  return {
    id: `slot-${next}`,
    cellarId: 'c1',
    deletedAt: null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, next)),
    ...fields,
  };
}

/** The fake table and its Prisma-like delegate. */
export function fakeSlots(initial: FakeSlot[] = []) {
  const rows = initial.map((row) => ({ ...row }));
  const delegate = {
    findMany: vi.fn(async ({ where, select, orderBy }: { where?: Where; select?: Record<string, boolean>; orderBy?: unknown } = {}) =>
      rows.filter((row) => matches(row, where)).sort(byOrder(orderBy)).map((row) => pick(row, select))),
    findFirst: vi.fn(async ({ where, select, include }: { where?: Where; select?: Record<string, boolean>; include?: unknown } = {}) => {
      const row = rows.find((candidate) => matches(candidate, where));
      return row ? { ...pick(row, select), ...(include ? { item: { productId: 'p1' } } : {}) } : null;
    }),
    count: vi.fn(async ({ where }: { where?: Where } = {}) => rows.filter((row) => matches(row, where)).length),
    create: vi.fn(async ({ data }: { data: Partial<FakeSlot> & { itemId: string; cellarId: string; column: number; row: number } }) => {
      const row = slot(data);
      rows.push(row);
      return { ...row };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeSlot> }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error(`no slot ${where.id}`);
      Object.assign(row, data);
      return { ...row };
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const index = rows.findIndex((candidate) => candidate.id === where.id);
      return rows.splice(index, 1)[0];
    }),
    deleteMany: vi.fn(async ({ where }: { where?: Where } = {}) => {
      const gone = rows.filter((row) => matches(row, where));
      for (const row of gone) rows.splice(rows.indexOf(row), 1);
      return { count: gone.length };
    }),
    updateMany: vi.fn(async ({ where, data }: { where?: Where; data: Partial<FakeSlot> }) => {
      const hit = rows.filter((row) => matches(row, where));
      hit.forEach((row) => Object.assign(row, data));
      return { count: hit.length };
    }),
  };
  return {
    rows,
    delegate,
    /** A unit's live cells, "column:row" by row then column ('' when none). */
    cellsOf: (itemId: string) => rows
      .filter((row) => row.itemId === itemId && row.deletedAt == null)
      .sort((a, b) => a.row - b.row || a.column - b.column)
      .map((row) => `${row.column}:${row.row}`)
      .join(' '),
    /** A unit's live slots as `include: { slots: UNIT_SLOTS_INCLUDE }` reads them. */
    viewsOf: (itemId: string) => rows
      .filter((row) => row.itemId === itemId && row.deletedAt == null)
      .sort((a, b) => a.row - b.row || a.column - b.column)
      .map(({ id, column, row }) => ({ id, column, row })),
  };
}
