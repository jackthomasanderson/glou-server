/**
 * API Helper with JWT Authentication
 * Automatically adds Authorization header with JWT token to all requests
 */

const TOKEN_KEY = "glou_access_token";
const REFRESH_TOKEN_KEY = "glou_refresh_token";

function getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

function clearTokens(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Fetch with automatic JWT authentication
 * Automatically adds Authorization header and handles token refresh on 401
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const accessToken = getAccessToken();

    const headers = new Headers(options.headers);
    if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
    }

    let response = await fetch(url, {
        ...options,
        headers,
    });

    // If 401, try to refresh token
    if (response.status === 401 && getRefreshToken()) {
        const refreshToken = getRefreshToken();
        if (refreshToken) {
            try {
                const refreshResponse = await fetch("/api/auth/refresh", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refreshToken }),
                });

                if (refreshResponse.ok) {
                    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await refreshResponse.json();
                    setTokens(newAccessToken, newRefreshToken);

                    // Retry original request with new token
                    headers.set("Authorization", `Bearer ${newAccessToken}`);
                    response = await fetch(url, {
                        ...options,
                        headers,
                    });
                } else {
                    // Refresh failed, clear tokens and redirect to login
                    clearTokens();
                    if (typeof window !== "undefined") {
                        window.location.href = "/login";
                    }
                }
            } catch (error) {
                console.error("Token refresh failed:", error);
                clearTokens();
                if (typeof window !== "undefined") {
                    window.location.href = "/login";
                }
            }
        }
    }

    return response;
}
