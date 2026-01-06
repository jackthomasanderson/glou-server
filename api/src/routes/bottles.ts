import { Router, Response } from "express";
import { ZodError } from "zod";
import { BottleService } from "../services/bottles.js";
import { createBottleSchema, updateBottleSchema } from "../schemas/bottles.js";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";
import { SessionService } from "../services/auth.js";
import { logger } from "../utils/logger.js";
import { BottlesErrorCode, ErrorCodeToI18nKey } from "../errors/bottlesErrors.js";

/**
 * Helper function to create consistent error responses with i18n support
 */
function createErrorResponse(code: BottlesErrorCode | string, statusCode: number = 400) {
  const i18nKey = ErrorCodeToI18nKey[code as BottlesErrorCode] || code;
  return { statusCode, error: { code, i18nKey } };
}

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
        const error = createErrorResponse(BottlesErrorCode.UNAUTHORIZED, 401);
        return res.status(error.statusCode).json(error.error);
      }

      const bottles = await bottleService.getBottlesByUserId(userId);
      return res.status(200).json(bottles);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to list bottles: ${errMsg}`);
      const error = createErrorResponse("LIST_FAILED", 500);
      return res.status(error.statusCode).json(error.error);
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
        const error = createErrorResponse(BottlesErrorCode.UNAUTHORIZED, 401);
        return res.status(error.statusCode).json(error.error);
      }

      const { cellarId } = req.params;
      const bottles = await bottleService.getBottlesBycellarId(cellarId, userId);
      return res.status(200).json(bottles);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to list cellar bottles: ${errMsg}`);
      const error = createErrorResponse("LIST_CELLAR_FAILED", 500);
      return res.status(error.statusCode).json(error.error);
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
        const error = createErrorResponse(BottlesErrorCode.UNAUTHORIZED, 401);
        return res.status(error.statusCode).json(error.error);
      }

      const { bottleId } = req.params;
      const bottle = await bottleService.getBottleById(bottleId, userId);

      if (!bottle) {
        const error = createErrorResponse(BottlesErrorCode.BOTTLE_NOT_FOUND, 404);
        return res.status(error.statusCode).json(error.error);
      }

      return res.status(200).json(bottle);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to get bottle: ${errMsg}`);
      const error = createErrorResponse("GET_FAILED", 500);
      return res.status(error.statusCode).json(error.error);
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
        const error = createErrorResponse(BottlesErrorCode.UNAUTHORIZED, 401);
        return res.status(error.statusCode).json(error.error);
      }

      const input = createBottleSchema.parse(req.body);
      const bottle = await bottleService.createBottle(input, userId);

      return res.status(201).json(bottle);
    } catch (err) {
      if (err instanceof ZodError) {
        const error = createErrorResponse(BottlesErrorCode.INVALID_INPUT, 400);
        return res.status(error.statusCode).json(error.error);
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to create bottle: ${errMsg}`);
      const error = createErrorResponse("CREATE_FAILED", 500);
      return res.status(error.statusCode).json(error.error);
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
        const error = createErrorResponse(BottlesErrorCode.UNAUTHORIZED, 401);
        return res.status(error.statusCode).json(error.error);
      }

      const { bottleId } = req.params;
      const input = updateBottleSchema.parse({ ...req.body, id: bottleId });
      const bottle = await bottleService.updateBottle(bottleId, input, userId);

      return res.status(200).json(bottle);
    } catch (err) {
      if (err instanceof ZodError) {
        const error = createErrorResponse(BottlesErrorCode.INVALID_INPUT, 400);
        return res.status(error.statusCode).json(error.error);
      }
      if (err instanceof Error && err.message === "BOTTLE_NOT_FOUND") {
        const error = createErrorResponse(BottlesErrorCode.BOTTLE_NOT_FOUND, 404);
        return res.status(error.statusCode).json(error.error);
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to update bottle: ${errMsg}`);
      const error = createErrorResponse("UPDATE_FAILED", 500);
      return res.status(error.statusCode).json(error.error);
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
        const error = createErrorResponse(BottlesErrorCode.UNAUTHORIZED, 401);
        return res.status(error.statusCode).json(error.error);
      }

      const { bottleId } = req.params;
      const bottle = await bottleService.softDeleteBottle(bottleId, userId);

      return res.status(200).json(bottle);
    } catch (err) {
      if (err instanceof Error && err.message === "BOTTLE_NOT_FOUND") {
        const error = createErrorResponse(BottlesErrorCode.BOTTLE_NOT_FOUND, 404);
        return res.status(error.statusCode).json(error.error);
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to delete bottle: ${errMsg}`);
      const error = createErrorResponse("DELETE_FAILED", 500);
      return res.status(error.statusCode).json(error.error);
    }
  });

  /**
   * PATCH /bottles/:bottleId/restore
   * Restore a soft-deleted bottle
   */
  router.patch("/:bottleId/restore", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        const error = createErrorResponse(BottlesErrorCode.UNAUTHORIZED, 401);
        return res.status(error.statusCode).json(error.error);
      }

      const { bottleId } = req.params;
      const bottle = await bottleService.restoreBottle(bottleId, userId);

      return res.status(200).json(bottle);
    } catch (err) {
      if (err instanceof Error && err.message === "BOTTLE_NOT_FOUND") {
        const error = createErrorResponse(BottlesErrorCode.BOTTLE_NOT_FOUND, 404);
        return res.status(error.statusCode).json(error.error);
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to restore bottle: ${errMsg}`);
      const error = createErrorResponse("RESTORE_FAILED", 500);
      return res.status(error.statusCode).json(error.error);
    }
  });

  return router;
}
