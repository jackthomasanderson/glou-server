import { v4 as uuidv4 } from "uuid";
import { Cave, CreateCaveInput, UpdateCaveInput } from "../schemas/caves.js";
import { DatabaseService } from "./database.js";
import { logger } from "../utils/logger.js";

/**
 * Cave management service
 */
export class CaveService {
  constructor(private db: DatabaseService) {}

  /**
   * Get all caves for a user
   */
  async getCavesByUserId(userId: string): Promise<Cave[]> {
    const query = `
      SELECT
        id,
        user_id as "userId",
        name,
        description,
        cave_type as "caveType",
        location_description as "locationDescription",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM caves
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.db.query(query, [userId]);
      return result.rows as Cave[];
    } catch (err) {
      logger.error("Failed to get caves for user");
      throw err;
    }
  }

  /**
   * Get a single cave by ID
   */
  async getCaveById(caveId: string, userId: string): Promise<Cave | null> {
    const query = `
      SELECT
        id,
        user_id as "userId",
        name,
        description,
        cave_type as "caveType",
        location_description as "locationDescription",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM caves
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = await this.db.query(query, [caveId, userId]);
      return result.rows.length > 0 ? (result.rows[0] as Cave) : null;
    } catch (err) {
      logger.error("Failed to get cave");
      throw err;
    }
  }

  /**
   * Create a new cave
   */
  async createCave(userId: string, input: CreateCaveInput): Promise<Cave> {
    const caveId = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO caves (id, user_id, name, description, cave_type, location_description, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        user_id as "userId",
        name,
        description,
        cave_type as "caveType",
        location_description as "locationDescription",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    try {
      const result = await this.db.query(query, [
        caveId,
        userId,
        input.name,
        input.description || null,
        input.caveType,
        input.locationDescription || null,
        now,
        now,
      ]);

      logger.info("Cave created");
      return result.rows[0] as Cave;
    } catch (err) {
      logger.error("Failed to create cave");
      throw err;
    }
  }

  /**
   * Update a cave
   */
  async updateCave(caveId: string, userId: string, input: UpdateCaveInput): Promise<Cave> {
    // Check ownership first
    const existing = await this.getCaveById(caveId, userId);
    if (!existing) {
      throw new Error("Cave not found or unauthorized");
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

    if (input.caveType !== undefined) {
      updates.push(`cave_type = $${paramIndex}`);
      values.push(input.caveType);
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
    values.push(caveId);
    values.push(userId);

    const query = `
      UPDATE caves
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex + 1} AND user_id = $${paramIndex + 2}
      RETURNING
        id,
        user_id as "userId",
        name,
        description,
        cave_type as "caveType",
        location_description as "locationDescription",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    try {
      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error("Cave update failed");
      }

      logger.info("Cave updated");
      return result.rows[0] as Cave;
    } catch (err) {
      logger.error("Failed to update cave");
      throw err;
    }
  }

  /**
   * Delete a cave
   */
  async deleteCave(caveId: string, userId: string): Promise<boolean> {
    // Check ownership first
    const existing = await this.getCaveById(caveId, userId);
    if (!existing) {
      throw new Error("Cave not found or unauthorized");
    }

    const query = `
      DELETE FROM caves
      WHERE id = $1 AND user_id = $2
    `;

    try {
      const result = await this.db.query(query, [caveId, userId]);
      logger.info("Cave deleted");
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      logger.error("Failed to delete cave");
      throw err;
    }
  }

  /**
   * Get cave with bottle count
   */
  async getCaveWithStats(caveId: string, userId: string): Promise<any> {
    const cave = await this.getCaveById(caveId, userId);
    if (!cave) {
      return null;
    }

    const countQuery = `
      SELECT COUNT(*) as count
      FROM bottles
      WHERE cave_id = $1 AND deleted_at IS NULL
    `;

    try {
      const result = await this.db.query(countQuery, [caveId]);
      const bottleCount = parseInt(result.rows[0]?.count || "0", 10);

      return {
        ...cave,
        bottleCount,
      };
    } catch (err) {
      logger.error("Failed to get cave with stats");
      return { ...cave, bottleCount: 0 };
    }
  }
}
