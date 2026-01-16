import { Router, Response, Request } from "express";
import { ZodError } from "zod";
import { CellarService } from "../services/cellars.js";
import { createCellarSchema, updateCellarSchema } from "../schemas/cellars.js";
import { authenticateJWT } from "../middleware/jwt.middleware.js";
import { logger } from "../utils/logger.js";

export function createCellarsRouter(cellarService: CellarService): Router {
  const router = Router();

  /**
   * GET /cellars
   * List all cellars for the authenticated user
   */
  router.get("/", authenticateJWT, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const cellars = await cellarService.getCellarsByUserId(userId);
      return res.status(200).json(cellars);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to list cellars: ${errMsg}`);
      console.error("Cellars route error:", err);
      return res.status(500).json({ error: "Failed to list cellars", details: errMsg });
    }
  });

  /**
   * GET /cellars/:cellarId
   * Get a single cellar by ID
   */
  router.get("/:cellarId", authenticateJWT, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { cellarId } = req.params;
      const cellar = await cellarService.getCellarWithStats(cellarId, userId);

      if (!cellar) {
        return res.status(404).json({ error: "Cellar not found" });
      }

      return res.status(200).json(cellar);
    } catch (err) {
      logger.error("Failed to get cellar");
      return res.status(500).json({ error: "Failed to get cellar" });
    }
  });

  /**
   * POST /cellars
   * Create a new cellar
   */
  router.post("/", authenticateJWT, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const payload = createCellarSchema.parse(req.body);
      const cellar = await cellarService.createCellar(userId, payload);

      return res.status(201).json(cellar);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Invalid input", details: err.errors });
      }
      logger.error({ err }, "Failed to create cellar");
      return res.status(500).json({ error: "Failed to create cellar" });
    }
  });

  /**
   * PUT /cellars/:cellarId
   * Update a cellar
   */
  router.put("/:cellarId", authenticateJWT, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { cellarId } = req.params;
      const payload = updateCellarSchema.parse(req.body);

      const cellar = await cellarService.updateCellar(cellarId, userId, payload);
      return res.status(200).json(cellar);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Invalid input", details: err.errors });
      }
      if (err instanceof Error && err.message.includes("not found")) {
        return res.status(404).json({ error: "Cellar not found" });
      }
      logger.error("Failed to update cellar");
      return res.status(500).json({ error: "Failed to update cellar" });
    }
  });

  /**
   * DELETE /cellars/:cellarId
   * Delete a cellar
   */
  router.delete("/:cellarId", authenticateJWT, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      const { cellarId } = req.params;
      logger.info({ cellarId, userId }, "DELETE cellar request received");

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const deleted = await cellarService.deleteCellar(cellarId, userId);

      if (!deleted) {
        logger.warn({ cellarId, userId }, "Cellar not found for deletion");
        return res.status(404).json({ error: "Cellar not found" });
      }

      logger.info({ cellarId, userId }, "Cellar deleted successfully, returning 204");
      return res.status(204).send();
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        return res.status(404).json({ error: "Cellar not found" });
      }
      logger.error({ err, cellarId: req.params.cellarId }, "Failed to delete cellar");
      return res.status(500).json({ error: "Failed to delete cellar" });
    }
  });

  return router;
}
