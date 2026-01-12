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

function maskToken(token?: string): string {
  if (!token) return "";
  if (token.length <= 8) return token;
  return `${token.slice(0,4)}...${token.slice(-4)}`;
}

/**
 * Middleware to authenticate request via session token
 * DÉSACTIVÉ POUR FEAT-01 : passe toujours (bypass)
 */
export function authMiddleware(sessionService: SessionService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      let token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        token = req.cookies?.["session_token"];
        if (!token) {
          token = getCookieValue(req.headers.cookie as string | undefined, "session_token");
        }
      }

      if (!token) {
        logger.info({ hasCookie: !!req.cookies, authHeader: !!req.headers.authorization }, "No token found in request");
        return res.status(401).json({ error: "Unauthorized: Missing session token" });
      }

      const session = await sessionService.getSessionByToken(token);
      if (!session) {
        logger.warn({ token: maskToken(token) }, "Invalid or expired session token");
        return res.status(401).json({ error: "Unauthorized: Invalid or expired session" });
      }

      await sessionService.updateSessionActivity(session.id);
      req.userId = session.userId;
      req.sessionId = session.id;

      next();
    } catch (error) {
      logger.error(error, "Auth middleware error");
      // eslint-disable-next-line no-console
      console.error('Auth middleware error:', error);
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
          logger.debug({ token: maskToken(token), sessionId: session.id }, "Optional auth - session found");
          await sessionService.updateSessionActivity(session.id);
          req.userId = session.userId;
          req.sessionId = session.id;
        } else {
          logger.debug({ token: maskToken(token) }, "Optional auth - no session found");
        }
      }

      next();
    } catch (error) {
      logger.error(error, "Optional auth middleware error");
      // eslint-disable-next-line no-console
      console.error('Optional auth middleware error:', error);
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
