import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

export interface AuthPayload {
  userId: string;
  email: string;
  scope?: 'full' | '2fa_pending';
  sessionId?: string;
}

/** Extend Express Request to carry authenticated user info */
declare global {
  namespace Express {
    interface Request {
      userId: string;
      userEmail: string;
      sessionId: string;
    }
  }
}

// Throttle session `lastActiveAt` writes to once every 5 minutes per session,
// to avoid a DB write on every single authenticated request.
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;
const lastActiveWriteCache = new Map<string, number>();

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Extract token from Authorization header (Bearer) or HttpOnly cookie
  const authHeader = req.headers.authorization;
  const token =
    (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined) ??
    (req.cookies as Record<string, string | undefined>)?.['glou_token'];

  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[auth] JWT_SECRET is not set');
    res.status(500).json({ error: 'SERVER_CONFIGURATION_ERROR' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as AuthPayload;
    if (payload.scope === '2fa_pending') {
      res.status(403).json({ error: '2FA_REQUIRED' });
      return;
    }

    // Verify account is still active (immediate effect on deactivation)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true },
    });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'ACCOUNT_DEACTIVATED' });
      return;
    }

    // Verify the session backing this token hasn't been revoked or expired
    // (FEAT-25: instant remote disconnect requires a server-side check).
    if (payload.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
        select: { revokedAt: true, expiresAt: true },
      });
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        res.status(401).json({ error: 'SESSION_REVOKED' });
        return;
      }

      const now = Date.now();
      const lastWrite = lastActiveWriteCache.get(payload.sessionId) ?? 0;
      if (now - lastWrite > LAST_ACTIVE_THROTTLE_MS) {
        lastActiveWriteCache.set(payload.sessionId, now);
        void prisma.session.update({
          where: { id: payload.sessionId },
          data: { lastActiveAt: new Date() },
        }).catch(() => {});
      }
    }

    req.userId = payload.userId;
    req.userEmail = payload.email;
    req.sessionId = payload.sessionId ?? '';
    next();
  } catch {
    res.status(401).json({ error: 'TOKEN_INVALID_OR_EXPIRED' });
  }
}

/** 
 * Admin middleware - must be used AFTER authMiddleware.
 * Checks if the authenticated user has isAdmin = true.
 */
export async function adminMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      res.status(403).json({ error: 'FORBIDDEN_ADMIN_ONLY' });
      return;
    }

    next();
  } catch (error) {
    console.error('[adminMiddleware] Error verifying admin status:', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}

/** Helper to extract client IP (supports reverse proxies) */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first?.trim() ?? 'unknown';
  }
  return req.headers['x-real-ip'] as string ?? req.socket.remoteAddress ?? 'unknown';
}
