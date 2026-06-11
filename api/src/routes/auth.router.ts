import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import jwt from 'jsonwebtoken';
import { registerSchema, loginSchema, verify2faSchema, turnOn2faSchema, turnOff2faSchema } from '../schemas/auth.schema';
import { authService, COOKIE_NAME, COOKIE_OPTIONS, SESSION_COOKIE_OPTIONS, LoginResult } from '../services/auth.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { auditLog } from '../services/audit.service';
import { AuthPayload } from '../services/auth.service';

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
    const result: LoginResult = await authService.login(data);
    const { user, token, requires2fa, rememberMe } = result;

    const cookieOpts = rememberMe ? COOKIE_OPTIONS : SESSION_COOKIE_OPTIONS;
    res.cookie(COOKIE_NAME, token, cookieOpts);
    if (!requires2fa) {
      void auditLog({ userId: user.id, action: 'LOGIN', status: 'success', ip });
    }
    res.json({ data: { ...user, requires2fa } });
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

// ─── POST /api/auth/2fa/verify-login ──────────────────────────────────────────

router.post('/2fa/verify-login', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    // Get the pending token from headers or cookies
    const authHeader = req.headers.authorization;
    const pendingToken =
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined) ??
      (req.cookies as Record<string, string | undefined>)?.['glou_token'];
      
    if (!pendingToken) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('SERVER_CONFIGURATION_ERROR');

    let userId = '';
    let rememberMe = false;
    try {
      // Decode the pending token to extract userId and rememberMe
      const payload = jwt.verify(pendingToken, secret) as AuthPayload;
      if (payload.scope !== '2fa_pending') {
        throw new Error('NOT_A_PENDING_TOKEN');
      }
      userId = payload.userId;
      rememberMe = payload.rememberMe ?? false;
    } catch {
      res.status(401).json({ error: 'TOKEN_INVALID_OR_EXPIRED' });
      return;
    }

    const { code } = verify2faSchema.parse(req.body);
    const result = await authService.verifyTwoFactorLogin(userId, code, rememberMe);

    const cookieOpts = result.rememberMe ? COOKIE_OPTIONS : SESSION_COOKIE_OPTIONS;
    res.cookie(COOKIE_NAME, result.token, cookieOpts);
    void auditLog({ userId: result.user.id, action: 'LOGIN_2FA', status: 'success', ip });
    res.json({ data: result.user });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const msg = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    res.status(401).json({ error: msg });
  }
});

// ─── POST /api/auth/2fa/generate ──────────────────────────────────────────────

router.post('/2fa/generate', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await authService.generateTwoFactorSecret(req.userId);
    res.json({ data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    res.status(400).json({ error: msg });
  }
});

// ─── POST /api/auth/2fa/turn-on ───────────────────────────────────────────────

router.post('/2fa/turn-on', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = turnOn2faSchema.parse(req.body);
    const data = await authService.turnOnTwoFactorAuthentication(req.userId, code);
    res.json({ data });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const msg = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    res.status(400).json({ error: msg });
  }
});

// ─── POST /api/auth/2fa/turn-off ──────────────────────────────────────────────

router.post('/2fa/turn-off', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { password, code } = turnOff2faSchema.parse(req.body);
    await authService.turnOffTwoFactorAuthentication(req.userId, password, code);
    res.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const msg = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    res.status(400).json({ error: msg });
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
