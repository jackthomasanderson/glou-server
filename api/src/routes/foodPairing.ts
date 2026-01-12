import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { fetchFoodPairingSuggestions } from "../services/foodPairingAI.js";
import type { SessionService } from "../services/auth.js";
import type { ProfileService } from "../services/profile.js";
import { AppSettingsService } from "../services/profile.js";

interface AuthenticatedRequest extends Express.Request {
  userId?: string;
}

export function createFoodPairingRouter(sessionService: SessionService, profileService: ProfileService, appSettingsService?: AppSettingsService): Router {
  const router = Router();

  // POST /food-pairing/suggest
  router.post("/suggest", authMiddleware(sessionService), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).userId;
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
