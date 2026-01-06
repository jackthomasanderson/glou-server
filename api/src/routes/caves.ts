import { Router, Response } from "express";
import { ZodError } from "zod";
import { CaveService } from "../services/caves.js";
import { createCaveSchema, updateCaveSchema } from "../schemas/caves.js";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";
import { SessionService } from "../services/auth.js";
import { logger } from "../utils/logger.js";

export function createCavesRouter(sessionService: SessionService, caveService: CaveService): Router {
  const router = Router();

  /**
   * GET /caves
   * List all caves for the authenticated user
   */
  router.get("/", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const caves = await caveService.getCavesByUserId(userId);
      return res.status(200).json(caves);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to list caves: ${errMsg}`);
      console.error("Caves route error:", err);
      return res.status(500).json({ error: "Failed to list caves", details: errMsg });
    }
  });

  /**
   * GET /caves/:caveId
   * Get a single cave by ID
   */
  router.get("/:caveId", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { caveId } = req.params;
      const cave = await caveService.getCaveById(caveId, userId);

      if (!cave) {
        return res.status(404).json({ error: "Cave not found" });
      }

      return res.status(200).json(cave);
    } catch (err) {
      logger.error("Failed to get cave");
      return res.status(500).json({ error: "Failed to get cave" });
    }
  });

  /**
   * POST /caves
   * Create a new cave
   */
  router.post("/", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const payload = createCaveSchema.parse(req.body);
      const cave = await caveService.createCave(userId, payload);

      return res.status(201).json(cave);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Invalid input", details: err.errors });
      }
      logger.error("Failed to create cave");
      return res.status(500).json({ error: "Failed to create cave" });
    }
  });

  /**
   * PUT /caves/:caveId
   * Update a cave
   */
  router.put("/:caveId", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { caveId } = req.params;
      const payload = updateCaveSchema.parse(req.body);

      const cave = await caveService.updateCave(caveId, userId, payload);
      return res.status(200).json(cave);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Invalid input", details: err.errors });
      }
      if (err instanceof Error && err.message.includes("not found")) {
        return res.status(404).json({ error: "Cave not found" });
      }
      logger.error("Failed to update cave");
      return res.status(500).json({ error: "Failed to update cave" });
    }
  });

  /**
   * DELETE /caves/:caveId
   * Delete a cave
   */
  router.delete("/:caveId", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { caveId } = req.params;
      const deleted = await caveService.deleteCave(caveId, userId);

      if (!deleted) {
        return res.status(404).json({ error: "Cave not found" });
      }

      return res.status(204).send();
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        return res.status(404).json({ error: "Cave not found" });
      }
      logger.error("Failed to delete cave");
      return res.status(500).json({ error: "Failed to delete cave" });
    }
  });

  return router;
}
