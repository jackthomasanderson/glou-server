import { Pool } from "pg";
import { bottleInputSchema, type BottleInput, type BottleRecord } from "./schema";
import { getDaysUntilPermanentDelete, trashRetentionMs } from "./trash";
import { ensureAuditSchema, initAuditPool } from "./audit";

export class BottleRepository {
  private pool: Pool | null;
  private inMemory: { items: Array<BottleRecord & { userId: string }> };
  private schemaReady: Promise<void> | null;
  private retentionDays: number;

  constructor() {
    this.pool = this.buildPool();
    this.inMemory = { items: [] };
    this.schemaReady = this.pool ? this.ensureSchema(this.pool) : null;
    this.retentionDays = Math.ceil(trashRetentionMs / (24 * 60 * 60 * 1000));
  }

  private buildPool(): Pool | null {
    if (process.env.DB_DISABLE === "1") return null;
    
    // During build time (SSG) or when DB env is missing, fall back to in-memory mode
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE === "phase-production-build") {
      return null;
    }
    
    const host = process.env.DB_HOST;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME;
    const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;
    
    if (!host || !user || !database) {
      // During build or in offline environments, use in-memory mode
      console.warn(
        "[BottleRepository] DB env missing (DB_HOST, DB_USER, DB_NAME) - using in-memory mode"
      );
      return null;
    }
    
    return new Pool({ host, user, password, database, port });
  }

  private async ensureSchema(pool: Pool) {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS bottles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bottles_user_id ON bottles(user_id);
      CREATE INDEX IF NOT EXISTS idx_bottles_deleted_at ON bottles(deleted_at);`
    );
    await ensureAuditSchema(pool);
    initAuditPool(pool);
  }

  private nowIso() {
    return new Date().toISOString();
  }

  private isTrashExpired(deletedAt: string | null): boolean {
    if (!deletedAt) return false;
    const daysRemaining = getDaysUntilPermanentDelete(deletedAt);
    return daysRemaining === null;
  }

  private mapRow(row: Record<string, unknown>): BottleRecord {
    const data = row.data as BottleInput;
    return {
      ...data,
      id: row.id as string,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
      deletedAt: row.deleted_at ? new Date(row.deleted_at as string).toISOString() : null
    };
  }

  async get(userId: string, id: string, includeDeleted = false): Promise<BottleRecord | null> {
    if (!this.pool) {
      this.inMemory.items = this.inMemory.items.filter((item) => !this.isTrashExpired(item.deletedAt));
      const found = this.inMemory.items.find((item) => item.id === id && item.userId === userId);
      if (!found) return null;
      if (!includeDeleted && found.deletedAt) return null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { userId: _userId, ...rest } = found;
      return rest as BottleRecord;
    }
    await this.schemaReady;
    const res = await this.pool.query(
      `SELECT id, data, created_at, updated_at, deleted_at
       FROM bottles
       WHERE id = $1 AND user_id = $2 ${includeDeleted ? "" : "AND deleted_at IS NULL"}
       LIMIT 1`,
      [id, userId]
    );
    if (res.rowCount === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async list(userId: string, includeDeleted = false): Promise<BottleRecord[]> {
    if (!this.pool) {
      this.inMemory.items = this.inMemory.items.filter((item) => !this.isTrashExpired(item.deletedAt));
      return this.inMemory.items
        .filter((item) => item.userId === userId)
        .filter((item) => includeDeleted || !item.deletedAt)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ userId: _userId, ...rest }) => rest as BottleRecord);
    }
    await this.schemaReady;
    await this.purgeExpired(userId);
    const res = await this.pool.query(
      `SELECT id, data, created_at, updated_at, deleted_at
       FROM bottles
       WHERE user_id = $1 ${includeDeleted ? "" : "AND deleted_at IS NULL"}
       ORDER BY updated_at DESC`,
      [userId]
    );
    return res.rows.map((row) => this.mapRow(row));
  }

  async create(userId: string, input: BottleInput): Promise<BottleRecord> {
    const parsed = bottleInputSchema.parse(input);
    const now = this.nowIso();
    const record: BottleRecord = { ...parsed, id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null };
    if (!this.pool) {
      this.inMemory.items = [{ ...record, userId }, ...this.inMemory.items];
      return record;
    }
    await this.schemaReady;
    await this.pool.query(
      `INSERT INTO bottles (id, user_id, data, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, NOW(), NOW(), NULL)`,
      [record.id, userId, parsed]
    );
    return record;
  }

  async update(userId: string, id: string, input: BottleInput): Promise<BottleRecord> {
    const parsed = bottleInputSchema.parse(input);
    const now = this.nowIso();
    if (!this.pool) {
      const index = this.inMemory.items.findIndex((i) => i.id === id && i.userId === userId);
      if (index === -1) throw new Error("NOT_FOUND");
      const itemWithUserId = this.inMemory.items[index];
      const updated: BottleRecord = { ...itemWithUserId, ...parsed, id, updatedAt: now };
      this.inMemory.items[index] = { ...updated, userId };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { userId: _userId, ...rest } = itemWithUserId;
      return { ...rest, ...parsed, id, updatedAt: now };
    }
    await this.schemaReady;
    const res = await this.pool.query(
      `UPDATE bottles
       SET data = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, data, created_at, updated_at, deleted_at`,
      [parsed, id, userId]
    );
    if (res.rowCount === 0) throw new Error("NOT_FOUND");
    return this.mapRow(res.rows[0]);
  }

  async softDelete(userId: string, id: string): Promise<BottleRecord> {
    const now = this.nowIso();
    if (!this.pool) {
      const index = this.inMemory.items.findIndex((i) => i.id === id && i.userId === userId);
      if (index === -1) throw new Error("NOT_FOUND");
      const itemWithUserId = this.inMemory.items[index];
      const updated: BottleRecord = { ...itemWithUserId, deletedAt: now, updatedAt: now };
      this.inMemory.items[index] = { ...updated, userId };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { userId: _userId, ...rest } = itemWithUserId;
      return { ...rest, deletedAt: now, updatedAt: now } as BottleRecord;
    }
    await this.schemaReady;
    const res = await this.pool.query(
      `UPDATE bottles
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, data, created_at, updated_at, deleted_at`,
      [id, userId]
    );
    if (res.rowCount === 0) throw new Error("NOT_FOUND");
    return this.mapRow(res.rows[0]);
  }

  async restore(userId: string, id: string): Promise<BottleRecord> {
    const now = this.nowIso();
    if (!this.pool) {
      const index = this.inMemory.items.findIndex((i) => i.id === id && i.userId === userId);
      if (index === -1) throw new Error("NOT_FOUND");
      const itemWithUserId = this.inMemory.items[index];
      const updated: BottleRecord = { ...itemWithUserId, deletedAt: null, updatedAt: now };
      this.inMemory.items[index] = { ...updated, userId };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { userId: _userId, ...rest } = itemWithUserId;
      return { ...rest, deletedAt: null, updatedAt: now } as BottleRecord;
    }
    await this.schemaReady;
    const res = await this.pool.query(
      `UPDATE bottles
       SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, data, created_at, updated_at, deleted_at`,
      [id, userId]
    );
    if (res.rowCount === 0) throw new Error("NOT_FOUND");
    return this.mapRow(res.rows[0]);
  }

  async purgeExpired(userId: string) {
    if (!this.pool) {
      this.inMemory.items = this.inMemory.items.filter((item) => item.userId !== userId || !this.isTrashExpired(item.deletedAt));
      return;
    }
    await this.schemaReady;
    await this.pool.query(
      `DELETE FROM bottles WHERE user_id = $1 AND deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '${this.retentionDays} days'`,
      [userId]
    );
  }

  resetForTests() {
    this.inMemory.items = [];
  }
}

// Use global to persist instance across HMR in development
declare global {
  // eslint-disable-next-line no-var
  var __bottleRepository: BottleRepository | undefined;
}

export const bottleRepository = global.__bottleRepository ?? (global.__bottleRepository = new BottleRepository());
