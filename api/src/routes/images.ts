import { Router, Response, Request } from "express";
import { authenticateJWT } from "../middleware/jwt.middleware.js";
import { ImageSearchService } from "../services/imageSearch.js";
import { logger } from "../utils/logger.js";

export function createImagesRouter(): Router {
    const router = Router();

    // All routes require authentication
    router.use(authenticateJWT);

    /**
     * GET /api/images/search?q=query
     * Search for an image URL based on a query string.
     */
    router.get("/search", async (req: Request, res: Response) => {
        try {
            const { q } = req.query;
            if (!q || typeof q !== "string") {
                return res.status(400).json({ error: "Missing query parameter 'q'" });
            }

            logger.info({ query: q }, "Image search request received");
            const imageUrl = await ImageSearchService.searchImage(q);

            if (!imageUrl) {
                return res.status(404).json({ error: "No image found" });
            }

            return res.status(200).json({ imageUrl });
        } catch (error) {
            logger.error(error, "Image search route error");
            return res.status(500).json({ error: "Internal server error" });
        }
    });

    return router;
}
