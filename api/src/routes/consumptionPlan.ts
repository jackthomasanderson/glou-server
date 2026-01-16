import { Router, Request, Response } from "express";
import { authenticateJWT } from "../middleware/jwt.middleware.js";
import { consumptionObjectiveSchema } from "../schemas/consumptionPlan.js";
import type { BottleService } from "../services/bottles.js";

export function createConsumptionPlanRouter(bottleService: BottleService): Router {
  const router = Router();

  // All routes require authentication
  router.use(authenticateJWT);

  // GET /consumption-plan/suggestions
  router.get("/suggestions", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      // Récupérer toutes les bouteilles de l'utilisateur
      const bottles = await bottleService.getBottlesByUserId(userId);
      const now = new Date();

      // Scoring simple :
      // +50 si dans la fenêtre d'apogée, +30 si entamée, +10 si niveau faible, -20 si hors apogée, +5 par an de garde dépassé, +score budget si < 20€
      const suggestions = bottles.map((bottle) => {
        let score = 0;
        let reason = [];

        // Apogée - using peakMaturityFrom and peakMaturityTo properties
        if (bottle.peakMaturityFrom && bottle.peakMaturityTo) {
          const year = now.getFullYear();
          if (bottle.peakMaturityFrom <= year && year <= bottle.peakMaturityTo) {
            score += 50;
            reason.push("consumption.suggestion.peakMaturity");
          } else if (year > bottle.peakMaturityTo) {
            score += 5 * (year - bottle.peakMaturityTo);
            reason.push("consumption.suggestion.pastMaturity");
          } else {
            score -= 20;
          }
        }

        // Entamée
        if (bottle.isOpened) {
          score += 30;
          reason.push("consumption.suggestion.opened");
        }

        // Niveau faible
        if (bottle.fillLevel && ["low", "empty"].includes(bottle.fillLevel)) {
          score += 10;
          reason.push("consumption.suggestion.lowLevel");
        }

        // Budget
        if (bottle.purchasePrice !== undefined && bottle.purchasePrice < 20) {
          score += 10;
          reason.push("consumption.suggestion.budget");
        }

        // TODO: rotation, objectifs, événements
        return {
          bottleId: bottle.id,
          reason: reason.join(","),
          score,
        };
      });

      // Trier par score décroissant
      suggestions.sort((a, b) => b.score - a.score);
      return res.json({ data: suggestions });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /consumption-plan/objective
  router.post("/objective", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const parsed = consumptionObjectiveSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid objective" });

      // TODO: persist user objective (DB or user profile)
      return res.json({ data: parsed.data });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /consumption-plan/weekly
  router.get("/weekly", async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      // TODO: generate weekly plan based on objectives and bottles
      return res.json({ data: { weekStart: new Date().toISOString(), suggestions: [] } });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
