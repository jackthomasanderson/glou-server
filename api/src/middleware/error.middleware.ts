import { Request, Response, NextFunction } from 'express';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[error-middleware]', err);
  res.status(500).json({ error: 'UNEXPECTED_ERROR' });
}
