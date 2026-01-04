import { Router, Response } from "express";
import { ZodError } from "zod";
import { authMiddleware, type AuthenticatedRequest } from "../middleware/auth.js";
import { SessionService } from "../services/auth.js";
import { AppSettingsService, ProfileService } from "../services/profile.js";
import { updateProfileSchema } from "../schemas/profile.js";
import { logger } from "../utils/logger.js";

export function createProfileRouter(
  sessionService: SessionService,
  profileService: ProfileService,
  appSettingsService: AppSettingsService
): Router {
  const router = Router();

  /**
   * GET /profile/app-settings
   * Public read for UI branding.
   */
  router.get("/app-settings", async (_req, res: Response) => {
    try {
      const settings = await appSettingsService.getAppSettings();
      res.json({ data: settings });
    } catch (error) {
      logger.error(error, "Get app settings (public) error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /profile/me
   * Current user's profile & preferences
   */
  router.get("/me", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const profile = await profileService.getProfileByUserId(req.userId);
      if (!profile) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ data: profile });
    } catch (error) {
      logger.error(error, "Get profile error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * PATCH /profile/me
   * Update current user's profile & preferences
   */
  router.patch("/me", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const payload = updateProfileSchema.parse(req.body);
      const profile = await profileService.updateProfile(req.userId, payload);
      res.json({ data: profile });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      logger.error(error, "Update profile error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /profile/notifications/test
   * Minimal test endpoint (webhook/gotify) to confirm configuration.
   */
  router.post("/notifications/test", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const profile = await profileService.getProfileByUserId(req.userId);
      if (!profile) {
        return res.status(404).json({ error: "User not found" });
      }

      const settings = (profile.notificationSettings ?? {}) as any;
      const channels = settings.channels ?? {};

      const results: Record<string, { attempted: boolean; ok?: boolean; error?: string }> = {
        webhook: { attempted: false },
        gotify: { attempted: false },
      };

      const payload = {
        title: "Glou test notification",
        message: "This is a test notification.",
        timestamp: new Date().toISOString(),
      };

      if (channels.webhook && typeof settings.webhookUrl === "string" && settings.webhookUrl.trim().length > 0) {
        results.webhook.attempted = true;
        try {
          const r = await fetch(settings.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          results.webhook.ok = r.ok;
          if (!r.ok) {
            results.webhook.error = `HTTP ${r.status}`;
          }
        } catch (e) {
          results.webhook.ok = false;
          results.webhook.error = e instanceof Error ? e.message : String(e);
        }
      }

      if (channels.gotify && typeof settings.gotifyUrl === "string" && settings.gotifyUrl.trim().length > 0) {
        results.gotify.attempted = true;
        try {
          const r = await fetch(settings.gotifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          results.gotify.ok = r.ok;
          if (!r.ok) {
            results.gotify.error = `HTTP ${r.status}`;
          }
        } catch (e) {
          results.gotify.ok = false;
          results.gotify.error = e instanceof Error ? e.message : String(e);
        }
      }

      res.json({ data: { results } });
    } catch (error) {
      logger.error(error, "Test notification error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
