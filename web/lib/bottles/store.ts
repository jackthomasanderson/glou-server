import { bottleInputSchema, type BottleInput, type BottleRecord } from "./schema";

export class BottleStoreError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "BottleStoreError";
  }
}

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

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const isTrashExpired = (deletedAt: string | null): boolean => {
  if (!deletedAt) return false;
  const now = new Date().getTime();
  const deletedTime = new Date(deletedAt).getTime();
  return now - deletedTime > TRASH_RETENTION_MS;
};

export const bottleStore = {
  list(includeDeleted = false): BottleRecord[] {
    const store = ensureStore();
    // Clean up expired trash items
    store.items = store.items.filter((item) => !isTrashExpired(item.deletedAt));
    
    return store.items
      .filter((item) => includeDeleted || !item.deletedAt)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  create(input: BottleInput): BottleRecord {
    console.debug("[bottleStore.create] input:", input);
    if (!input || typeof input !== 'object') {
      console.error("[bottleStore.create] invalid input type:", typeof input, input);
      throw new BottleStoreError("INVALID_INPUT");
    }
    if (!('category' in input)) {
      console.error("[bottleStore.create] missing category in:", input);
      throw new BottleStoreError("MISSING_CATEGORY");
    }
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
  },

  getDaysUntilPermanentDelete(deletedAt: string | null): number | null {
    if (!deletedAt) return null;
    const now = new Date().getTime();
    const deletedTime = new Date(deletedAt).getTime();
    const timeRemaining = TRASH_RETENTION_MS - (now - deletedTime);
    if (timeRemaining <= 0) return null;
    return Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
  }
};
