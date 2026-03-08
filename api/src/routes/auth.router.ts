import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { registerSchema, loginSchema } from '../schemas/auth.schema';
import { authService, COOKIE_NAME, COOKIE_OPTIONS } from '../services/auth.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { auditLog } from '../services/audit.service';

const router = Router();

// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const data = registerSchema.parse(req.body);
    const { user, token } = await authService.register(data);

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    void auditLog({ userId: user.id, action: 'REGISTER', status: 'success', ip });
    res.status(201).json({ data: user });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      res.status(400).json({ error: 'VALIDATION_ERROR', details: issues });
      return;
    }
    const msg = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    const status = ['USERNAME_ALREADY_TAKEN', 'EMAIL_ALREADY_TAKEN'].includes(msg) ? 409 : 500;
    res.status(status).json({ error: msg });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const data = loginSchema.parse(req.body);
    const { user, token } = await authService.login(data);

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    void auditLog({ userId: user.id, action: 'LOGIN', status: 'success', ip });
    res.json({ data: user });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const msg = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    // Always 401 for invalid credentials (no enumeration)
    res.status(401).json({ error: msg === 'INVALID_CREDENTIALS' ? 'INVALID_CREDENTIALS' : 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', authMiddleware, (req: Request, res: Response): void => {
  const ip = getClientIp(req);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  void auditLog({ userId: req.userId, action: 'LOGOUT', status: 'success', ip });
  res.json({ data: { ok: true } });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await authService.me(req.userId);
    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND' });
      return;
    }
    res.json({ data: user });
  } catch {
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as authRouter };
