import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { registerSchema, loginSchema, verify2faSchema, turnOn2faSchema, turnOff2faSchema } from '../schemas/auth.schema';
import { setPinSchema, removePinSchema, unlockSchema } from '../schemas/user.schema';
import { authService, COOKIE_NAME, COOKIE_OPTIONS, SESSION_COOKIE_OPTIONS, LoginResult } from '../services/auth.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { auditLog } from '../services/audit.service';
import { AuthPayload } from '../services/auth.service';
import { passwordResetService } from '../services/password-reset.service';
import { systemConfigService } from '../services/system-config.service';

const passwordResetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
// FEAT-30: a PIN is only 4-6 digits — throttle unlock attempts hard to make brute-force impractical.
const unlockLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

const router = Router();

// ─── Trusted-device cookie (FEAT-25) ───────────────────────────────────────────
// Long-lived, scoped to /api/auth only — never sent to the rest of the API and
// never cleared on logout (the whole point is to survive a disconnection).
const TRUSTED_DEVICE_COOKIE_NAME = 'glou_trusted_device';
const TRUSTED_DEVICE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/api/auth',
};

function readDeviceInfo(req: Request): { userAgent: string | undefined; ip: string } {
  return { userAgent: req.headers['user-agent'], ip: getClientIp(req) };
}

// The trusted-device cookie carries a signed wrapper, not the raw device
// token: like the session cookie, its value is a JWT rather than a bearer
// secret sitting in clear text in the browser's cookie jar. The random token
// inside is still what auth.service matches (hashed) against the TrustedDevice
// table — the JWT layer just makes the cookie tamper-evident and gives it an
// independent expiry. A pre-existing raw-token cookie simply fails to verify
// and the device falls back to a one-time 2FA challenge.
const TRUSTED_DEVICE_TOKEN_TTL = '30d';

function packTrustedDeviceToken(rawToken: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_NOT_SET');
  return jwt.sign({ tdt: rawToken }, secret, { expiresIn: TRUSTED_DEVICE_TOKEN_TTL });
}

function readTrustedDeviceCookie(req: Request): string | undefined {
  const wrapped = (req.cookies as Record<string, string | undefined>)?.[TRUSTED_DEVICE_COOKIE_NAME];
  if (!wrapped) return undefined;
  const secret = process.env.JWT_SECRET;
  if (!secret) return undefined;
  try {
    const payload = jwt.verify(wrapped, secret);
    if (typeof payload === 'object' && payload !== null) {
      const tdt = (payload as { tdt?: unknown }).tdt;
      if (typeof tdt === 'string') return tdt;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const data = registerSchema.parse(req.body);
    const { user, token } = await authService.register(data, readDeviceInfo(req));

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
    const trustedDeviceToken = readTrustedDeviceCookie(req);
    const result: LoginResult = await authService.login(data, readDeviceInfo(req), trustedDeviceToken);
    const { user, token, requires2fa, rememberMe } = result;

    const cookieOpts = rememberMe ? COOKIE_OPTIONS : SESSION_COOKIE_OPTIONS;
    res.cookie(COOKIE_NAME, token, cookieOpts);
    if (!requires2fa) {
      void auditLog({
        userId: user.id,
        action: 'LOGIN',
        status: 'success',
        ip,
        details: result.viaTrustedDevice ? { via: 'trusted_device' } : undefined,
      });
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

    const { code, trustDevice } = verify2faSchema.parse(req.body);
    const result = await authService.verifyTwoFactorLogin(userId, code, rememberMe, readDeviceInfo(req), trustDevice);

    const cookieOpts = result.rememberMe ? COOKIE_OPTIONS : SESSION_COOKIE_OPTIONS;
    res.cookie(COOKIE_NAME, result.token, cookieOpts);
    if (result.trustedDeviceToken) {
      res.cookie(TRUSTED_DEVICE_COOKIE_NAME, packTrustedDeviceToken(result.trustedDeviceToken), TRUSTED_DEVICE_COOKIE_OPTIONS);
    }
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
    const data = await authService.turnOnTwoFactorAuthentication(req.userId, code, readDeviceInfo(req));
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
    await authService.turnOffTwoFactorAuthentication(req.userId, password, readDeviceInfo(req), req.sessionId, code);
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
// Note: the trusted-device cookie is intentionally left untouched — trust must
// survive a logout, that's the entire point of the "remember this device" feature.

router.post('/logout', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  if (req.sessionId) {
    try {
      await authService.revokeSession(req.userId, req.sessionId);
    } catch {
      // Session already gone/invalid — logout must still succeed client-side.
    }
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  void auditLog({ userId: req.userId, action: 'LOGOUT', status: 'success', ip });
  res.json({ data: { ok: true } });
});

// ─── GET /api/auth/sessions ────────────────────────────────────────────────────

router.get('/sessions', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await authService.listSessions(req.userId, req.sessionId);
    res.json({ data: sessions });
  } catch {
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── DELETE /api/auth/sessions/:id ─────────────────────────────────────────────

router.delete('/sessions/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    await authService.revokeSession(req.userId, req.params.id);
    void auditLog({ userId: req.userId, action: 'SESSION_REVOKE', status: 'success', ip, details: { sessionId: req.params.id } });
    res.json({ data: { ok: true } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    if (msg === 'NOT_FOUND') {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/auth/trust-device ───────────────────────────────────────────────

router.post('/trust-device', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const { token } = await authService.trustCurrentDevice(req.userId, readDeviceInfo(req));
    res.cookie(TRUSTED_DEVICE_COOKIE_NAME, packTrustedDeviceToken(token), TRUSTED_DEVICE_COOKIE_OPTIONS);
    void auditLog({ userId: req.userId, action: 'TRUST_DEVICE', status: 'success', ip });
    res.json({ data: { ok: true } });
  } catch {
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── DELETE /api/auth/trust-device ─────────────────────────────────────────────

router.delete('/trust-device', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const trustedDeviceToken = readTrustedDeviceCookie(req);
    if (trustedDeviceToken) {
      await authService.untrustCurrentDevice(req.userId, trustedDeviceToken);
    }
    res.clearCookie(TRUSTED_DEVICE_COOKIE_NAME, { path: '/api/auth' });
    void auditLog({ userId: req.userId, action: 'UNTRUST_DEVICE', status: 'success', ip });
    res.json({ data: { ok: true } });
  } catch {
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── Quick Lock & Auto-Lock (FEAT-30) ─────────────────────────────────────────
// Client-side lock only: the session/JWT stays valid throughout, these routes
// never mint a new token. See auth.service.ts (setPin/removePin/verifyUnlock).

// ─── POST /api/auth/pin ────────────────────────────────────────────────────────

router.post('/pin', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const { password, pin } = setPinSchema.parse(req.body);
    await authService.setPin(req.userId, password, pin);
    void auditLog({ userId: req.userId, action: 'PIN_SET', status: 'success', ip });
    res.json({ data: { ok: true } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const msg = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    if (msg === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: msg });
      return;
    }
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── DELETE /api/auth/pin ───────────────────────────────────────────────────────

router.delete('/pin', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const { password } = removePinSchema.parse(req.body);
    await authService.removePin(req.userId, password);
    void auditLog({ userId: req.userId, action: 'PIN_REMOVE', status: 'success', ip });
    res.json({ data: { ok: true } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const msg = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    if (msg === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: msg });
      return;
    }
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── POST /api/auth/unlock ───────────────────────────────────────────────────────
// Verifies password OR PIN to lift the client-side lock. Never touches the
// Session/JWT — this is a pure secret check, not a re-authentication.

router.post('/unlock', unlockLimiter, authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const data = unlockSchema.parse(req.body);
    const ok = await authService.verifyUnlock(req.userId, data);
    if (!ok) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }
    res.json({ data: { ok: true } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
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

// ─── GET /api/auth/smtp-status ────────────────────────────────────────────────

router.get('/smtp-status', async (_req: Request, res: Response): Promise<void> => {
  const smtpEnabled = await systemConfigService.isSmtpEnabled();
  res.json({ data: { smtpEnabled } });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────

router.post('/forgot-password', passwordResetLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    // Always returns 200 to prevent user enumeration
    await passwordResetService.requestReset(email.trim().toLowerCase());
    res.json({ data: { ok: true } });
  } catch {
    res.json({ data: { ok: true } });
  }
});

// ─── POST /api/auth/validate-reset-token ─────────────────────────────────────

router.post('/validate-reset-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const result = await passwordResetService.validateToken(token);
    res.json({ data: result });
  } catch {
    res.json({ data: { valid: false } });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────

router.post('/reset-password', passwordResetLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || typeof token !== 'string' || typeof newPassword !== 'string') {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
      return;
    }
    await passwordResetService.resetPassword(token, newPassword);
    res.json({ data: { ok: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNEXPECTED_ERROR';
    res.status(400).json({ error: msg });
  }
});

export { router as authRouter };
