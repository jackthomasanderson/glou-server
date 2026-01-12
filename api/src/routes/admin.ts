// ...existing imports...
import { Router, Response } from "express";
import { ZodError } from "zod";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";
import { SessionService, UserService } from "../services/auth.js";
import { AppSettingsService, ProfileService } from "../services/profile.js";
import { updateAppSettingsSchema, updateUserRoleSchema } from "../schemas/profile.js";
import { logger } from "../utils/logger.js";

async function requireAdmin(req: AuthenticatedRequest, res: Response, userService: UserService): Promise<boolean> {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  const user = await userService.getUserById(req.userId);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  if ((user as any).role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }

  return true;
}

export function createAdminRouter(
  sessionService: SessionService,
  userService: UserService,
  profileService: ProfileService,
  appSettingsService: AppSettingsService
): Router {
  const router = Router();
  // GET clé IA globale (admin only)
  router.get("/ai-api-key", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    if (!(await requireAdmin(req, res, userService))) return;
    const settings = await appSettingsService.getAppSettings();
    res.json({ aiApiKey: settings.aiApiKey });
  });

  // SET clé IA globale (admin only)
  router.post("/ai-api-key", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    if (!(await requireAdmin(req, res, userService))) return;
    const { aiApiKey } = req.body;
    await appSettingsService.setAiApiKey(aiApiKey);
    res.json({ success: true });
  });

  /**
   * GET /admin/users
   */
  router.get("/users", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res, userService))) return;
      const users = await profileService.listUsers();
      res.json({ data: users });
    } catch (error) {
      logger.error(error, "List users error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * PATCH /admin/users/:userId/role
   */
  router.patch("/users/:userId/role", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res, userService))) return;

      const { userId } = req.params;
      const payload = updateUserRoleSchema.parse(req.body);
      await profileService.updateUserRole(userId, payload.role);
      res.json({ message: "Role updated" });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      logger.error(error, "Update user role error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /admin/app-settings
   */
  router.get("/app-settings", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res, userService))) return;
      const settings = await appSettingsService.getAppSettings();
      res.json({ data: settings });
    } catch (error) {
      logger.error(error, "Get app settings error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * PATCH /admin/app-settings
   */
  router.patch("/app-settings", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await requireAdmin(req, res, userService))) return;
      const payload = updateAppSettingsSchema.parse(req.body);
      const settings = await appSettingsService.updateAppSettings(payload);
      res.json({ data: settings });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      logger.error(error, "Update app settings error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
