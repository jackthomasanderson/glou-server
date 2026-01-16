import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, extractTokenFromHeader, TokenPayload } from "../lib/jwt.js";
import { logger } from "../utils/logger.js";

/**
 * JWT authentication middleware
 * Replaces session-based authentication
 */

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload;
        }
    }
}

/**
 * Middleware to authenticate requests using JWT
 * Attaches user information to req.user if token is valid
 */
export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
        res.status(401).json({ error: "Authentication required" });
        return;
    }

    const payload = verifyAccessToken(token);

    if (!payload) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
    }

    // Attach user to request
    req.user = payload;
    logger.debug({ userId: payload.userId, username: payload.username }, "User authenticated via JWT");

    next();
}

/**
 * Optional JWT authentication
 * Attaches user if token is present and valid, but doesn't reject if missing
 */
export function optionalAuthenticateJWT(req: Request, res: Response, next: NextFunction): void {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (token) {
        const payload = verifyAccessToken(token);
        if (payload) {
            req.user = payload;
            logger.debug({ userId: payload.userId }, "User authenticated via JWT (optional)");
        }
    }

    next();
}

/**
 * Middleware to check if user has admin role
 * Must be used after authenticateJWT
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
    }

    if (req.user.role !== "admin") {
        res.status(403).json({ error: "Admin access required" });
        return;
    }

    next();
}
