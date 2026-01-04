import { Request, Response, NextFunction } from "express";
import { SessionService } from "../services/auth.js";
import { DatabaseService } from "../services/database.js";
import { logger } from "../utils/logger.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rawRest] = part.trim().split("=");
    if (!rawKey) continue;
    if (rawKey === name) {
      return rawRest.join("=");
    }
  }
  return undefined;
}

/**
 * Middleware to authenticate request via session token
 */
export function authMiddleware(sessionService: SessionService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Get token from Authorization header or session cookie
      let token = req.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        // Try to get from cookies
        token = req.cookies?.["session_token"];

        // If cookie-parser isn't installed, fall back to parsing the raw header.
        if (!token) {
          token = getCookieValue(req.headers.cookie as string | undefined, "session_token");
        }
      }

      if (!token) {
        return res.status(401).json({ error: "Unauthorized: Missing session token" });
      }

      const session = await sessionService.getSessionByToken(token);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized: Invalid or expired session" });
      }

      // Update last activity
      await sessionService.updateSessionActivity(session.id);

      req.userId = session.userId;
      req.sessionId = session.id;

      next();
    } catch (error) {
      logger.error(error, "Auth middleware error");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

/**
 * Middleware to optionally authenticate (don't fail if no token)
 */
export function optionalAuthMiddleware(sessionService: SessionService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      let token = req.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        token = req.cookies?.["session_token"];
        if (!token) {
          token = getCookieValue(req.headers.cookie as string | undefined, "session_token");
        }
      }

      if (token) {
        const session = await sessionService.getSessionByToken(token);
        if (session) {
          await sessionService.updateSessionActivity(session.id);
          req.userId = session.userId;
          req.sessionId = session.id;
        }
      }

      next();
    } catch (error) {
      logger.error(error, "Optional auth middleware error");
      next();
    }
  };
}

/**
 * Middleware to log security events
 */
export function securityEventMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";

  res.on("finish", () => {
    // Log successful and failed auth attempts
    if (req.path.includes("/auth/") && res.statusCode >= 200 && res.statusCode < 300) {
      logger.info({ method: req.method, path: req.path, status: res.statusCode, userId: req.userId, ipAddress }, "Auth action successful");
    } else if (req.path.includes("/auth/") && res.statusCode >= 400) {
      logger.warn({ method: req.method, path: req.path, status: res.statusCode, ipAddress }, "Auth action failed");
    }
  });

  next();
}
