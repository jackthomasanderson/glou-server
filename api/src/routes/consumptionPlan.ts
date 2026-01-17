import { Router, Request, Response } from "express";
import { authenticateJWT } from "../middleware/jwt.middleware.js";
import {
  consumptionObjectiveSchema,
  updateConsumptionObjectiveSchema,
  markConsumedSchema,
  skipBottleSchema,
  consumptionHistoryQuerySchema,
} from "../schemas/consumptionPlan.js";
import { ConsumptionPlanService } from "../services/consumption.service.js";
import { logger } from "../utils/logger.js";

export function createConsumptionPlanRouter(): Router {
  const router = Router();
  const service = new ConsumptionPlanService();

  // All routes require authentication
  router.use(authenticateJWT);

  /**
   * GET /consumption-plan/suggestions
   * Get prioritized consumption suggestions
   */
  router.get("/suggestions", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const filterByCollection = req.query.collection as string | undefined;
      const maxBudget = req.query.maxBudget
        ? parseFloat(req.query.maxBudget as string)
        : undefined;

      const suggestions = await service.generateSuggestions(userId, {
        limit,
        filterByCollection,
        maxBudget,
      });

      return res.json({ data: suggestions });
    } catch (e) {
      logger.error({ err: e }, "Failed to fetch consumption suggestions");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /consumption-plan/objectives
   * Get user's consumption objectives
   */
  router.get("/objectives", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const active = await service.getActiveObjective(userId);
      return res.json({ data: active });
    } catch (e) {
      logger.error({ err: e }, "Failed to fetch consumption objectives");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /consumption-plan/objectives
   * Create a new consumption objective
   */
  router.post("/objectives", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = consumptionObjectiveSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid objective data",
          details: parsed.error.errors,
        });
      }

      const objective = await service.createObjective(userId, parsed.data);
      return res.status(201).json({ data: objective });
    } catch (e) {
      logger.error({ err: e }, "Failed to create consumption objective");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * PUT /consumption-plan/objectives/:id
   * Update an existing objective
   */
  router.put("/objectives/:id", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const parsed = updateConsumptionObjectiveSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid objective data",
          details: parsed.error.errors,
        });
      }

      const objective = await service.updateObjective(id, userId, parsed.data);
      return res.json({ data: objective });
    } catch (e) {
      logger.error({ err: e }, "Failed to update consumption objective");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * DELETE /consumption-plan/objectives/:id
   * Delete (deactivate) an objective
   */
  router.delete("/objectives/:id", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      await service.deleteObjective(id, userId);
      return res.json({ success: true });
    } catch (e) {
      logger.error({ err: e }, "Failed to delete consumption objective");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /consumption-plan/weekly
   * Get weekly consumption plan
   */
  router.get("/weekly", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const plan = await service.generateWeeklyPlan(userId);
      return res.json({ data: plan });
    } catch (e) {
      logger.error({ err: e }, "Failed to generate weekly plan");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /consumption-plan/consume
   * Mark a bottle as consumed
   */
  router.post("/consume", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = markConsumedSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid consume data",
          details: parsed.error.errors,
        });
      }

      const eventDate = parsed.data.eventDate
        ? new Date(parsed.data.eventDate)
        : undefined;

      await service.markBottleConsumed(
        userId,
        parsed.data.bottleId,
        parsed.data.notes,
        eventDate
      );

      return res.json({ success: true, message: "Bottle marked as consumed" });
    } catch (e) {
      logger.error({ err: e }, "Failed to mark bottle as consumed");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /consumption-plan/skip
   * Skip/postpone a bottle
   */
  router.post("/skip", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = skipBottleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid skip data",
          details: parsed.error.errors,
        });
      }

      await service.skipBottle(userId, parsed.data.bottleId, parsed.data.reason);

      return res.json({ success: true, message: "Bottle postponed" });
    } catch (e) {
      logger.error({ err: e }, "Failed to skip bottle");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /consumption-plan/history
   * Get consumption history
   */
  router.get("/history", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = consumptionHistoryQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid query parameters",
          details: parsed.error.errors,
        });
      }

      const options: any = {};
      if (parsed.data.limit) options.limit = parsed.data.limit;
      if (parsed.data.startDate) options.startDate = new Date(parsed.data.startDate);
      if (parsed.data.endDate) options.endDate = new Date(parsed.data.endDate);

      const history = await service.getConsumptionHistory(userId, options);
      return res.json({ data: history });
    } catch (e) {
      logger.error({ err: e }, "Failed to fetch consumption history");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
