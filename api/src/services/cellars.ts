import { v4 as uuidv4 } from "uuid";
import { Cellar, CellarWithStats, CreateCellarInput, UpdateCellarInput } from "../schemas/cellars.js";
import { CellarRepository } from "../repositories/cellar.repository.js";
import { logger } from "../utils/logger.js";
import { Prisma } from "@prisma/client";

/**
 * Cellar management service
 */
export class CellarService {
  private repo: CellarRepository;

  constructor() {
    this.repo = new CellarRepository();
  }

  /**
   * Get all cellars for a user
   */
  async getCellarsByUserId(userId: string): Promise<CellarWithStats[]> {
    try {
      const cellars = await this.repo.getCellarsByUserId(userId);
      return cellars.map(c => ({
        id: c.id,
        userId: c.user_id,
        name: c.name,
        description: c.description,
        cellarType: c.cellar_type as any, // Enum
        locationDescription: c.location_description,
        placement: c.placement,
        modelName: c.model_name,
        bottleCapacity: c.bottle_capacity,
        shelfCount: c.shelf_count,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        bottleCount: c.bottleCount,
        cigarCount: c.cigarCount,
      }));
    } catch (err) {
      logger.error({ err, userId }, "Failed to get cellars for user");
      throw new Error("Failed to get cellars");
    }
  }

  /**
   * Get a single cellar by ID
   */
  async getCellarById(cellarId: string, userId: string): Promise<Cellar | null> {
    try {
      const c = await this.repo.getCellarById(cellarId, userId);
      if (!c) return null;

      return {
        id: c.id,
        userId: c.user_id,
        name: c.name,
        description: c.description,
        cellarType: c.cellar_type as any,
        locationDescription: c.location_description,
        placement: c.placement,
        modelName: c.model_name,
        bottleCapacity: c.bottle_capacity,
        shelfCount: c.shelf_count,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    } catch (err) {
      logger.error({ err, cellarId }, "Failed to get cellar");
      throw new Error("Failed to get cellar");
    }
  }

  /**
   * Create a new cellar
   */
  async createCellar(userId: string, input: CreateCellarInput): Promise<Cellar> {
    const cellarId = uuidv4();
    const now = new Date();

    try {
      const data: Prisma.cellarsCreateInput = {
        id: cellarId,
        users: { connect: { id: userId } },
        name: input.name,
        description: input.description || null,
        cellar_type: input.cellarType,
        location_description: input.locationDescription || null,
        placement: input.placement || null,
        model_name: input.modelName || null,
        bottle_capacity: input.bottleCapacity ?? null,
        shelf_count: input.shelfCount ?? null,
        created_at: now,
        updated_at: now,
      };

      const c = await this.repo.createCellar(userId, data);

      logger.info("Cellar created");
      return {
        id: c.id,
        userId: c.user_id,
        name: c.name,
        description: c.description,
        cellarType: c.cellar_type as any,
        locationDescription: c.location_description,
        placement: c.placement,
        modelName: c.model_name,
        bottleCapacity: c.bottle_capacity,
        shelfCount: c.shelf_count,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    } catch (err) {
      logger.error(err, "Failed to create cellar");
      throw err;
    }
  }

  /**
   * Update a cellar
   */
  async updateCellar(cellarId: string, userId: string, input: UpdateCellarInput): Promise<Cellar> {
    try {
      const data: Prisma.cellarsUpdateInput = {
        updated_at: new Date(),
      };

      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      if (input.cellarType !== undefined) data.cellar_type = input.cellarType;
      if (input.locationDescription !== undefined) data.location_description = input.locationDescription;
      if (input.placement !== undefined) data.placement = input.placement;
      if (input.modelName !== undefined) data.model_name = input.modelName;
      if (input.bottleCapacity !== undefined) data.bottle_capacity = input.bottleCapacity;
      if (input.shelfCount !== undefined) data.shelf_count = input.shelfCount;

      const c = await this.repo.updateCellar(cellarId, userId, data);

      logger.info("Cellar updated");
      return {
        id: c.id,
        userId: c.user_id,
        name: c.name,
        description: c.description,
        cellarType: c.cellar_type as any,
        locationDescription: c.location_description,
        placement: c.placement,
        modelName: c.model_name,
        bottleCapacity: c.bottle_capacity,
        shelfCount: c.shelf_count,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    } catch (err) {
      logger.error("Failed to update cellar");
      throw err;
    }
  }

  /**
   * Delete a cellar
   */
  async deleteCellar(cellarId: string, userId: string): Promise<boolean> {
    logger.info({ cellarId, userId }, "Attempting to delete cellar");
    try {
      const success = await this.repo.deleteCellar(cellarId, userId);
      if (success) {
        logger.info({ cellarId }, "Cellar deleted successfully");
        return true;
      } else {
        logger.warn({ cellarId, userId }, "Cellar not found or unauthorized for deletion");
        throw new Error("Cellar not found or unauthorized");
      }
    } catch (err) {
      logger.error({ err, cellarId }, "Failed to delete cellar from database");
      throw err;
    }
  }

  /**
   * Get cellar with bottle count
   */
  async getCellarWithStats(cellarId: string, userId: string): Promise<CellarWithStats | null> {
    try {
      const c = await this.repo.getCellarWithStats(cellarId, userId);
      if (!c) return null;

      return {
        id: c.id,
        userId: c.user_id,
        name: c.name,
        description: c.description,
        cellarType: c.cellar_type as any,
        locationDescription: c.location_description,
        placement: c.placement,
        modelName: c.model_name,
        bottleCapacity: c.bottle_capacity,
        shelfCount: c.shelf_count,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        bottleCount: c.bottleCount,
        cigarCount: c.cigarCount,
      };
    } catch (err) {
      logger.error("Failed to get cellar with stats");
      throw err;
    }
  }
}
