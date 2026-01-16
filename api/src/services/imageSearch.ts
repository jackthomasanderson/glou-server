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

            // Try to extract all JSON metadata chunks from Bing's results
            const jsonRegex = /m="({&quot;murl&quot;:&quot;https?:\/\/.*?&quot;.*?})"/g;
            const jsonMatches = html.match(jsonRegex);

            let fallbackUrl: string | null = null;

            if (jsonMatches) {
                for (const match of jsonMatches) {
                    try {
                        // Extract content between m=" and "
                        const jsonStr = match.substring(3, match.length - 1).replace(/&quot;/g, '"');
                        const data = JSON.parse(jsonStr);

                        if (data.murl) {
                            // If it's a portrait image (likely a bottle/cigar stick), return immediately
                            if (data.h && data.w && data.h > data.w) {
                                logger.info({ query, url: data.murl, w: data.w, h: data.h }, "Found portrait image (best match)");
                                return data.murl;
                            }
                            // Store the first one as fallback if no portrait and no other result yet
                            if (!fallbackUrl) fallbackUrl = data.murl;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }

            if (fallbackUrl) {
                logger.info({ query, url: fallbackUrl }, "Using first image found as fallback");
                return fallbackUrl;
            }

            // Fallback: simple regex search for absolute image URLs
            const imgRegex = /https:\/\/[^\s"'<>&]+\.(?:jpg|jpeg|png|webp)/gi;
            const imgMatches = html.match(imgRegex);
            if (imgMatches && imgMatches.length > 0) {
                const validImgs = imgMatches
                    .map(src => src.replace(/[&;,]+$/, ''))
                    .filter(src =>
                        !src.includes("bing.com") &&
                        !src.includes("mm.bing.net") &&
                        !src.includes("favicon") &&
                        !src.includes("logo") &&
                        !src.includes("icon") &&
                        src.length < 500
                    );
                if (validImgs.length > 0) {
                    logger.info({ query, url: validImgs[0] }, "Image found via legacy fallback pattern");
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
