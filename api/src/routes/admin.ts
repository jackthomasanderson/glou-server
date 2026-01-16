import { Router, Response, Request } from "express";
import { ZodError } from "zod";
import { authenticateJWT, requireAdmin as jwtRequireAdmin } from "../middleware/jwt.middleware.js";
import { UserService } from "../services/auth.js";
import { AppSettingsService, ProfileService } from "../services/profile.js";
import { updateAppSettingsSchema, updateUserRoleSchema, updateUserSchema } from "../schemas/profile.js";
import { logger } from "../utils/logger.js";
import { CryptoService } from "../services/crypto.js";

export function createAdminRouter(
  userService: UserService,
  profileService: ProfileService,
  appSettingsService: AppSettingsService
): Router {
  const router = Router();

  // All admin routes require authentication AND admin role
  router.use(authenticateJWT);
  router.use(jwtRequireAdmin);

  // GET clé IA globale (admin only)
  router.get("/ai-api-key", async (req: Request, res: Response) => {
    const settings = await appSettingsService.getAppSettings();
    res.json({ aiApiKey: settings.aiApiKey });
  });

  // SET clé IA globale (admin only)
  router.post("/ai-api-key", async (req: Request, res: Response) => {
    const { aiApiKey } = req.body;
    await appSettingsService.setAiApiKey(aiApiKey);
    res.json({ success: true });
  });

  /**
   * GET /admin/users
   */
  router.get("/users", async (req: Request, res: Response) => {
    try {
      const users = await profileService.listUsers();
      res.json({ data: users });
    } catch (error) {
      logger.error(error, "List users error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /admin/users
   */
  router.post("/users", async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email) {
        return res.status(400).json({ error: "Username and email required" });
      }

      // Check if user exists
      const existingUser = await userService.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const existingEmail = await userService.getUserByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email already registered" });
      }

      const defaultPassword = password || "Glou" + Math.random().toString(36).slice(-8);
      const passwordHash = await CryptoService.hashPassword(defaultPassword);

      const user = await userService.createUser({ username, email, password: defaultPassword }, passwordHash);

      res.status(201).json({
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      logger.error(error, "Create user error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * PATCH /admin/users/:userId/role
   */
  router.patch("/users/:userId/role", async (req: Request, res: Response) => {
    try {
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
   * PATCH /admin/users/:userId
   */
  router.patch("/users/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const payload = updateUserSchema.parse(req.body);
      await profileService.updateUser(userId, payload);
      res.json({ message: "User updated" });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      logger.error(error, "Update user error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * DELETE /admin/users/:userId
   */
  router.delete("/users/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      if (userId === req.user?.userId) {
        return res.status(400).json({ error: "You cannot delete yourself" });
      }

      await profileService.deleteUser(userId);
      res.json({ message: "User deleted" });
    } catch (error) {
      logger.error(error, "Delete user error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /admin/app-settings
   */
  router.get("/app-settings", async (req: Request, res: Response) => {
    try {
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
  router.patch("/app-settings", async (req: Request, res: Response) => {
    try {
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
