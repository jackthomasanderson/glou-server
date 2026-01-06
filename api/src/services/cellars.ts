import { v4 as uuidv4 } from "uuid";
import { Cellar, CreateCellarInput, UpdateCellarInput } from "../schemas/cellars.js";
import { DatabaseService } from "./database.js";
import { logger } from "../utils/logger.js";

/**
 * Cellar management service
 */
export class CellarService {
  constructor(private db: DatabaseService) {}

  /**
   * Get all cellars for a user
   */
  async getCellarsByUserId(userId: string): Promise<Cellar[]> {
    const query = `
      SELECT
        id,
        user_id as "userId",
        name,
        description,
        cellar_type as "cellarType",
        location_description as "locationDescription",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM cellars
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.db.query(query, [userId]);
      return result.rows as Cellar[];
    } catch (err) {
      logger.error("Failed to get cellars for user");
      throw err;
    }
  }

  /**
   * Get a single cellar by ID
   */
  async getCellarById(cellarId: string, userId: string): Promise<Cellar | null> {
    const query = `
      SELECT
        id,
        user_id as "userId",
        name,
        description,
        cellar_type as "cellarType",
        location_description as "locationDescription",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM cellars
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = await this.db.query(query, [cellarId, userId]);
      return result.rows.length > 0 ? (result.rows[0] as Cellar) : null;
    } catch (err) {
      logger.error("Failed to get cellar");
      throw err;
    }
  }

  /**
   * Create a new cellar
   */
  async createCellar(userId: string, input: CreateCellarInput): Promise<Cellar> {
    const cellarId = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO cellars (id, user_id, name, description, cellar_type, location_description, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        user_id as "userId",
        name,
        description,
        cellar_type as "cellarType",
        location_description as "locationDescription",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    try {
      const result = await this.db.query(query, [
        cellarId,
        userId,
        input.name,
        input.description || null,
        input.cellarType,
        input.locationDescription || null,
        now,
        now,
      ]);

      logger.info("Cellar created");
      return result.rows[0] as Cellar;
    } catch (err) {
      logger.error("Failed to create cellar");
      throw err;
    }
  }

  /**
   * Update a cellar
   */
  async updateCellar(cellarId: string, userId: string, input: UpdateCellarInput): Promise<Cellar> {
    // Check ownership first
    const existing = await this.getCellarById(cellarId, userId);
    if (!existing) {
      throw new Error("Cellar not found or unauthorized");
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(input.name);
      paramIndex++;
    }

    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(input.description);
      paramIndex++;
    }

    if (input.cellarType !== undefined) {
      updates.push(`cellar_type = $${paramIndex}`);
      values.push(input.cellarType);
      paramIndex++;
    }

    if (input.locationDescription !== undefined) {
      updates.push(`location_description = $${paramIndex}`);
      values.push(input.locationDescription);
      paramIndex++;
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = $${paramIndex}`);
    values.push(new Date());
    values.push(cellarId);
    values.push(userId);

    const query = `
      UPDATE cellars
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex + 1} AND user_id = $${paramIndex + 2}
      RETURNING
        id,
        user_id as "userId",
        name,
        description,
        cellar_type as "cellarType",
        location_description as "locationDescription",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    try {
      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error("Cellar update failed");
      }

      logger.info("Cellar updated");
      return result.rows[0] as Cellar;
    } catch (err) {
      logger.error("Failed to update cellar");
      throw err;
    }
  }

  /**
   * Delete a cellar
   */
  async deleteCellar(cellarId: string, userId: string): Promise<boolean> {
    // Check ownership first
    const existing = await this.getCellarById(cellarId, userId);
    if (!existing) {
      throw new Error("Cellar not found or unauthorized");
    }

    const query = `
      DELETE FROM cellars
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = await this.db.query(query, [cellarId, userId]);
      logger.info("Cellar deleted");
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      logger.error("Failed to delete cellar");
      throw err;
    }
  }

  /**
   * Get cellar with bottle count
   */
  async getCellarWithStats(cellarId: string, userId: string): Promise<any> {
    const cellar = await this.getCellarById(cellarId, userId);
    if (!cellar) {
      return null;
    }

    const countQuery = `
      SELECT COUNT(*) as count
      FROM bottles
      WHERE cellar_id = $1 AND deleted_at IS NULL
    `;

    try {
      const result = await this.db.query(countQuery, [cellarId]);
      const bottleCount = parseInt(result.rows[0]?.count || "0", 10);

      return {
        ...cellar,
        bottleCount,
      };
    } catch (err) {
      logger.error("Failed to get cellar with stats");
      return { ...cellar, bottleCount: 0 };
    }
  }
}
