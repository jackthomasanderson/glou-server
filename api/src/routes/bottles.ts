import { Router, Response } from "express";
import { ZodError } from "zod";
import { BottleService } from "../services/bottles.js";
import { createBottleSchema, updateBottleSchema } from "../schemas/bottles.js";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";
import { SessionService } from "../services/auth.js";
import { logger } from "../utils/logger.js";

export function createBottlesRouter(sessionService: SessionService, bottleService: BottleService): Router {
  const router = Router();

  /**
   * GET /bottles
   * List all bottles for the authenticated user
   */
  router.get("/", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const bottles = await bottleService.getBottlesByUserId(userId);
      return res.status(200).json(bottles);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to list bottles: ${errMsg}`);
      return res.status(500).json({ error: "Failed to list bottles", details: errMsg });
    }
  });

  /**
   * GET /bottles/cellar/:cellarId
   * List all bottles in a specific cellar
   */
  router.get("/cellar/:cellarId", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { cellarId } = req.params;
      const bottles = await bottleService.getBottlesBycellarId(cellarId, userId);
      return res.status(200).json(bottles);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to list cellar bottles: ${errMsg}`);
      return res.status(500).json({ error: "Failed to list cellar bottles", details: errMsg });
    }
  });

  /**
   * GET /bottles/:bottleId
   * Get a single bottle by ID
   */
  router.get("/:bottleId", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { bottleId } = req.params;
      const bottle = await bottleService.getBottleById(bottleId, userId);

      if (!bottle) {
        return res.status(404).json({ error: "Bottle not found" });
      }

      return res.status(200).json(bottle);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to get bottle: ${errMsg}`);
      return res.status(500).json({ error: "Failed to get bottle", details: errMsg });
    }
  });

  /**
   * POST /bottles
   * Create a new bottle
   */
  router.post("/", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const input = createBottleSchema.parse(req.body);
      const bottle = await bottleService.createBottle(input, userId);

      return res.status(201).json(bottle);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Validation error", issues: err.errors });
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to create bottle: ${errMsg}`);
      return res.status(500).json({ error: "Failed to create bottle", details: errMsg });
    }
  });

  /**
   * PUT /bottles/:bottleId
   * Update a bottle
   */
  router.put("/:bottleId", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { bottleId } = req.params;
      const input = updateBottleSchema.parse({ ...req.body, id: bottleId });
      const bottle = await bottleService.updateBottle(bottleId, input, userId);

      return res.status(200).json(bottle);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Validation error", issues: err.errors });
      }
      if (err instanceof Error && err.message === "BOTTLE_NOT_FOUND") {
        return res.status(404).json({ error: "Bottle not found" });
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to update bottle: ${errMsg}`);
      return res.status(500).json({ error: "Failed to update bottle", details: errMsg });
    }
  });

  /**
   * DELETE /bottles/:bottleId
   * Soft delete a bottle
   */
  router.delete("/:bottleId", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { bottleId } = req.params;
      const bottle = await bottleService.softDeleteBottle(bottleId, userId);

      return res.status(200).json(bottle);
    } catch (err) {
      if (err instanceof Error && err.message === "BOTTLE_NOT_FOUND") {
        return res.status(404).json({ error: "Bottle not found" });
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to delete bottle: ${errMsg}`);
      return res.status(500).json({ error: "Failed to delete bottle", details: errMsg });
    }
  });

  return router;
}
