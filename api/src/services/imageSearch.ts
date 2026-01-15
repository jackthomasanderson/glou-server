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

        logger.info({ query }, "Starting image search");

        try {
            // Bing Image Search URL
            const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&first=1`;

            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9,fr;q=0.8"
                }
            });

            if (!response.ok) {
                logger.warn({ status: response.status, query }, "Bing image search failed (not ok)");
                return null;
            }

            const html = await response.text();

            // Try multiple patterns to extract image URLs from Bing

            // Pattern 1: murl field (media URL) - most reliable
            const murlRegex = /"murl":"(https?:\/\/[^"]+)"/;
            const murlMatch = html.match(murlRegex);
            if (murlMatch && murlMatch[1]) {
                logger.info({ query, url: murlMatch[1] }, "Image found via murl pattern");
                return murlMatch[1];
            }

            // Pattern 2: imgurl field
            const imgurlRegex = /"imgurl":"(https?:\/\/[^"]+)"/;
            const imgurlMatch = html.match(imgurlRegex);
            if (imgurlMatch && imgurlMatch[1]) {
                logger.info({ query, url: imgurlMatch[1] }, "Image found via imgurl pattern");
                return imgurlMatch[1];
            }

            // Pattern 3: Look for image URLs in src attributes
            const srcRegex = /src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i;
            const srcMatch = html.match(srcRegex);
            if (srcMatch && srcMatch[1]) {
                const imgUrl = srcMatch[1];
                if (!imgUrl.includes("bing.com") && !imgUrl.includes("favicon")) {
                    logger.info({ query, url: imgUrl }, "Image found via src pattern");
                    return imgUrl;
                }
            }

            // Fallback: simple regex search for absolute image URLs
            // Match URLs that end with image extensions, stopping at quotes, spaces, or HTML entities
            const imgRegex = /https:\/\/[^\s"'<>&]+\.(?:jpg|jpeg|png|webp)/gi;
            const imgMatches = html.match(imgRegex);
            if (imgMatches && imgMatches.length > 0) {
                // Filter out some common tracking/icon URLs and clean up any trailing characters
                const validImgs = imgMatches
                    .map(src => {
                        // Remove any trailing HTML entities or special characters
                        return src.replace(/[&;,]+$/, '');
                    })
                    .filter(src =>
                        !src.includes("bing.com") &&
                        !src.includes("mm.bing.net") &&
                        !src.includes("favicon") &&
                        !src.includes("logo") &&
                        !src.includes("icon") &&
                        src.length < 500 // Avoid extremely long URLs
                    );
                if (validImgs.length > 0) {
                    logger.info({ query, url: validImgs[0] }, "Image found via fallback pattern");
                    return validImgs[0];
                }
            }

            logger.warn({ query }, "No image found for query");
            return null;
        } catch (error) {
            logger.error({ error, query }, "Image search service error");
            return null;
        }
    }
}
