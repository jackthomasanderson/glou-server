import { bottleInputSchema, type BottleInput, type BottleRecord } from "./schema";
import { bottlesClient, BottlesClientError } from "./client";

export class BottleStoreError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "BottleStoreError";
  }
}

/**
 * Bottle store - now backed by PostgreSQL via API
 * Previous in-memory implementation replaced with API-based persistence
 */
export const bottleStore = {
  async list(includeDeleted = false): Promise<BottleRecord[]> {
    try {
      const bottles = await bottlesClient.list();
      // Filter out deleted items if not requested
      return bottles
        .filter((item) => includeDeleted || !item.deletedAt)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (err) {
      if (err instanceof BottlesClientError) {
        throw new BottleStoreError(err.code);
      }
      throw new BottleStoreError("LIST_FAILED");
    }
  },

  async listByCellar(cellarId: string, includeDeleted = false): Promise<BottleRecord[]> {
    try {
      const bottles = await bottlesClient.listByCellar(cellarId);
      return bottles
        .filter((item) => includeDeleted || !item.deletedAt)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (err) {
      if (err instanceof BottlesClientError) {
        throw new BottleStoreError(err.code);
      }
      throw new BottleStoreError("LIST_CELLAR_FAILED");
    }
  },

  async create(input: BottleInput): Promise<BottleRecord> {
    try {
      // Validate input locally before sending
      bottleInputSchema.parse(input);
      
      // Ensure cellarId is present
      const inputWithCellar = input as BottleInput & { cellarId: string };
      if (!inputWithCellar.cellarId) {
        throw new BottleStoreError("MISSING_CELLAR_ID");
      }

      const created = await bottlesClient.create(inputWithCellar);
      return created;
    } catch (err) {
      if (err instanceof BottleStoreError) throw err;
      if (err instanceof BottlesClientError) {
        throw new BottleStoreError(err.code);
      }
      throw new BottleStoreError("CREATE_FAILED");
    }
  },

  async update(id: string, input: BottleInput): Promise<BottleRecord> {
    try {
      // Validate input locally before sending
      bottleInputSchema.parse(input);

      const updated = await bottlesClient.update(id, input as BottleInput & { cellarId: string });
      return updated;
    } catch (err) {
      if (err instanceof BottleStoreError) throw err;
      if (err instanceof BottlesClientError) {
        throw new BottleStoreError(err.code);
      }
      throw new BottleStoreError("UPDATE_FAILED");
    }
  },

  async softDelete(id: string): Promise<BottleRecord> {
    try {
      const deleted = await bottlesClient.delete(id);
      return deleted;
    } catch (err) {
      if (err instanceof BottlesClientError) {
        throw new BottleStoreError(err.code);
      }
      throw new BottleStoreError("DELETE_FAILED");
    }
  },

  getDaysUntilPermanentDelete(deletedAt: string | null): number | null {
    if (!deletedAt) return null;
    const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const now = new Date().getTime();
    const deletedTime = new Date(deletedAt).getTime();
    const timeRemaining = TRASH_RETENTION_MS - (now - deletedTime);
    if (timeRemaining <= 0) return null;
    return Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
  }
};
