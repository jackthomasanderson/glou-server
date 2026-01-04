import { bottleInputSchema, type BottleInput, type BottleRecord } from "./schema";

type BottleStoreState = {
  items: BottleRecord[];
};

type MutableGlobal = typeof globalThis & {
  __glouBottleStore?: BottleStoreState;
};

const ensureStore = (): BottleStoreState => {
  const globalWithStore = globalThis as MutableGlobal;
  if (!globalWithStore.__glouBottleStore) {
    globalWithStore.__glouBottleStore = { items: [] };
  }
  return globalWithStore.__glouBottleStore;
};

const nowIso = () => new Date().toISOString();

export class BottleStoreError extends Error {}

export const bottleStore = {
  list(includeDeleted = false): BottleRecord[] {
    const store = ensureStore();
    return store.items
      .filter((item) => includeDeleted || !item.deletedAt)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  create(input: BottleInput): BottleRecord {
    const parsed = bottleInputSchema.parse(input);
    const store = ensureStore();
    const now = nowIso();
    const record: BottleRecord = {
      ...parsed,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    store.items = [record, ...store.items];
    return record;
  },

  update(id: string, input: BottleInput): BottleRecord {
    const store = ensureStore();
    const index = store.items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new BottleStoreError("NOT_FOUND");
    }
    const parsed = bottleInputSchema.parse(input);
    const updated: BottleRecord = {
      ...store.items[index],
      ...parsed,
      id,
      updatedAt: nowIso()
    };
    store.items[index] = updated;
    return updated;
  },

  softDelete(id: string): BottleRecord {
    const store = ensureStore();
    const index = store.items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new BottleStoreError("NOT_FOUND");
    }
    const deleted: BottleRecord = {
      ...store.items[index],
      deletedAt: nowIso(),
      updatedAt: nowIso()
    };
    store.items[index] = deleted;
    return deleted;
  },

  restore(id: string): BottleRecord {
    const store = ensureStore();
    const index = store.items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new BottleStoreError("NOT_FOUND");
    }
    const restored: BottleRecord = {
      ...store.items[index],
      deletedAt: null,
      updatedAt: nowIso()
    };
    store.items[index] = restored;
    return restored;
  }
};
