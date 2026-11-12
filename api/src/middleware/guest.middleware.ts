import { Request, Response, NextFunction } from 'express';
import { sharesService } from '../services/shares.service';
import { GuestShare } from '@prisma/client';
import { routeParam } from '../lib/http';

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
  const token = routeParam(req.params.token);

  if (!token) {
    res.status(400).json({ error: 'MISSING_TOKEN' });
    return;
  }

  // #467: a database failure is not a dead link: Express 5 forwards the
  // rejection to the error middleware, which answers 503 during an outage.
  const share = await sharesService.findByToken(token);

  if (!share) {
    res.status(404).json({ error: 'SHARE_NOT_FOUND' });
    return;
  }

  if (!sharesService.isShareValid(share) || !(await sharesService.isCreatorActive(share.userId))) {
    res.status(403).json({ error: 'SHARE_EXPIRED_OR_REVOKED' });
    return;
  }

  req.guestShare = share;
  next();
}
