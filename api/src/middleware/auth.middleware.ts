import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  email: string;
}

/** Extend Express Request to carry authenticated user info */
declare global {
  namespace Express {
    interface Request {
      userId: string;
      userEmail: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
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
    const payload = jwt.verify(token, secret) as AuthPayload;
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ error: 'TOKEN_INVALID_OR_EXPIRED' });
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
