/**
 * HTTP client for images API
 */

const API_BASE = "/api/images";

export const imagesClient = {
    async search(query: string): Promise<string | null> {
        try {
            const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
            });

            if (!res.ok) {
                if (res.status === 404) return null;
                throw new Error("Failed to search image");
            }

            const data = await res.json();
            return data.imageUrl || null;
        } catch (err) {
            console.error("Image search error:", err);
            return null;
        }
    },
};
