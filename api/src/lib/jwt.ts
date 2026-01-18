import jwt, { SignOptions } from "jsonwebtoken";
import { logger } from "../utils/logger.js";

/**
 * JWT token management
 * Replaces database-stored sessions with stateless authentication
 */

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_PRODUCTION";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

if (JWT_SECRET === "CHANGE_ME_IN_PRODUCTION") {
    logger.warn("JWT_SECRET not set in environment variables. Using default (INSECURE).");
}

export interface TokenPayload {
    userId: string;
    username: string;
    email: string;
    role: string;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

/**
 * Generate access and refresh tokens
 * @param payload - User information to encode in token
 * @returns TokenPair - Access and refresh tokens
 */
export function generateTokens(payload: TokenPayload): TokenPair {
    // Pass options directly to avoid type issues
    const accessToken = jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: "glou-server",
        audience: "glou-client",
    } as SignOptions);

    const refreshToken = jwt.sign(
        { userId: payload.userId },
        JWT_SECRET,
        {
            expiresIn: JWT_REFRESH_EXPIRES_IN,
            issuer: "glou-server",
            audience: "glou-client",
        } as SignOptions
    );

    return { accessToken, refreshToken };
}

/**
 * Verify and decode an access token
 * @param token - JWT token to verify
 * @returns TokenPayload | null - Decoded payload or null if invalid
 */
export function verifyAccessToken(token: string): TokenPayload | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: "glou-server",
            audience: "glou-client",
        }) as TokenPayload;

        return decoded;
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            logger.debug("Access token expired");
        } else if (error instanceof jwt.JsonWebTokenError) {
            logger.warn({ error }, "Invalid access token");
        }
        return null;
    }
}

/**
 * Verify and decode a refresh token
 * @param token - Refresh token to verify
 * @returns { userId: string } | null - User ID or null if invalid
 */
export function verifyRefreshToken(token: string): { userId: string } | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            issuer: "glou-server",
            audience: "glou-client",
        }) as { userId: string };

        return decoded;
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            logger.debug("Refresh token expired");
        } else if (error instanceof jwt.JsonWebTokenError) {
            logger.warn({ error }, "Invalid refresh token");
        }
        return null;
    }
}

/**
 * Extract token from Authorization header
 * @param authHeader - Authorization header value
 * @returns string | null - Token or null if not found
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
        return null;
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return null;
    }

    return parts[1];
}
