import fetch from "node-fetch";
import { logger } from "../utils/logger.js";

/**
 * Service to search for images on the web.
 * Uses a scraper-style approach to find image URLs.
 */
export class ImageSearchService {
    /**
     * Search for an image URL based on a query.
     * Tries Bing first as it's usually less restrictive for simple scraping.
     */
    static async searchImage(query: string): Promise<string | null> {
        if (!query || query.trim().length === 0) return null;

        try {
            // Bing Image Search URL
            const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&first=1`;

            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8"
                }
            });

            if (!response.ok) {
                logger.warn({ status: response.status, query }, "Bing image search failed (not ok)");
                return null;
            }

            const html = await response.text();

            // Bing uses m="{"imgurl":"..."}" for image data
            // We look for the first occurrence
            const regex = /m="({&quot;imgurl&quot;:&quot;(https:[^&]*)?&quot;[^}]*})"/;
            const match = html.match(regex);

            if (match && match[1]) {
                try {
                    // Unescape &quot; to "
                    const jsonStr = match[1].replace(/&quot;/g, '"');
                    const data = JSON.parse(jsonStr);
                    if (data.imgurl) {
                        logger.info({ query, url: data.imgurl }, "Image found successfully");
                        return data.imgurl;
                    }
                } catch (parseError) {
                    logger.error({ parseError, match: match[1] }, "Failed to parse Bing image JSON");
                }
            }

            // Fallback: simple regex search for absolute image URLs if JSON parsing fails
            const imgRegex = /https:\/\/[^"'\s<>]*\.(?:jpg|jpeg|png|webp)/gi;
            const imgMatches = html.match(imgRegex);
            if (imgMatches && imgMatches.length > 0) {
                // Filter out some common tracking/icon URLs
                const validImgs = imgMatches.filter(src =>
                    !src.includes("bing.com") &&
                    !src.includes("mm.bing.net") &&
                    !src.includes("favicon") &&
                    !src.includes("logo")
                );
                if (validImgs.length > 0) return validImgs[0];
            }

            logger.warn({ query }, "No image found for query");
            return null;
        } catch (error) {
            logger.error({ error, query }, "Image search service error");
            return null;
        }
    }
}
