import { Router, Request, Response } from "express";
import { authenticateJWT } from "../middleware/jwt.middleware.js";
import { fetchFoodPairingSuggestions } from "../services/foodPairingAI.js";
import type { ProfileService } from "../services/profile.js";
import { AppSettingsService } from "../services/profile.js";

export function createFoodPairingRouter(profileService: ProfileService, appSettingsService?: AppSettingsService): Router {
  const router = Router();

  // All routes require authentication
  router.use(authenticateJWT);

  // POST /food-pairing/suggest
  router.post("/suggest", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "Missing prompt" });

      const profile = await profileService.getProfileByUserId(userId);
      let apiKey = profile?.aiApiKey;

      if (!apiKey && appSettingsService) {
        const settings = await appSettingsService.getAppSettings();
        apiKey = settings.aiApiKey;
      }

      if (!apiKey) return res.status(400).json({ error: "No AI API key set (profile or global)" });

      const aiResult = await fetchFoodPairingSuggestions({ prompt, apiKey });
      res.json({ data: aiResult });
    } catch (e) {
      res.status(500).json({ error: "AI suggestion error" });
    }
  });

  return router;
}
