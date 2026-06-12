import { Request, Response, NextFunction } from 'express';
import { sharesService } from '../services/shares.service';
import { GuestShare } from '@prisma/client';

/** Extend Express Request to carry the resolved GuestShare context */
declare global {
  namespace Express {
    interface Request {
      guestShare?: GuestShare;
    }
  }
}

/**
 * Middleware for guest (token-based) routes.
 * Reads :token from the route params, validates expiry & revocation,
 * and attaches the resolved GuestShare to req.guestShare.
 */
export async function guestMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { token } = req.params;

  if (!token) {
    res.status(400).json({ error: 'MISSING_TOKEN' });
    return;
  }

  try {
    const share = await sharesService.findByToken(token);

    if (!share) {
      res.status(404).json({ error: 'SHARE_NOT_FOUND' });
      return;
    }

    if (!sharesService.isShareValid(share)) {
      res.status(403).json({ error: 'SHARE_EXPIRED_OR_REVOKED' });
      return;
    }

    req.guestShare = share;
    next();
  } catch (error) {
    console.error('[guestMiddleware] Error validating token:', error);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
