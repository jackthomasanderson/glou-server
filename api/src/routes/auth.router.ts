import { Router, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import jwt from 'jsonwebtoken';
import { registerSchema, loginSchema, verify2faSchema, turnOn2faSchema, turnOff2faSchema, trustDeviceSchema, regenerateBackupCodesSchema, forgotPasswordSchema, validateResetTokenSchema, resetPasswordSchema } from '../schemas/auth.schema';
import { setPinSchema, removePinSchema, unlockSchema } from '../schemas/user.schema';
import { authService, COOKIE_NAME, COOKIE_OPTIONS, SESSION_COOKIE_OPTIONS, KNOWN_BROWSER_COOKIE_NAME, KNOWN_BROWSER_COOKIE_OPTIONS, LoginResult } from '../services/auth.service';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { authRateLimit, passwordCheckLimiter, signInAccountLimiter, unlockAccountLimiter } from '../lib/rate-limit';
import { auditLog } from '../services/audit.service';
import { AuthPayload } from '../services/auth.service';
import { passwordResetService } from '../services/password-reset.service';
import { systemConfigService } from '../services/system-config.service';
import { prisma } from '../lib/prisma';
import { isCookieSecure } from '../lib/cookie-secure';

const passwordResetLimiter = authRateLimit(5);
// FEAT-30: a PIN is only 4-6 digits — throttle unlock attempts hard to make brute-force impractical.
// Only wrong codes count: a family tablet is unlocked many times a day (#582).
const unlockLimiter = authRateLimit(10, { skipSuccessfulRequests: true });

const router = Router();

// ─── Trusted-device cookie (FEAT-25) ───────────────────────────────────────────
// Long-lived, scoped to /api/auth only — never sent to the rest of the API and
// never cleared on logout (the whole point is to survive a disconnection).
const TRUSTED_DEVICE_COOKIE_NAME = 'glou_trusted_device';
const TRUSTED_DEVICE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isCookieSecure(),
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/api/auth',
};

// ─── Known-browser cookie (#988, see auth.service) ─────────────────────────────

function setKnownBrowserCookie(res: Response, token: string | undefined): void {
  if (token) res.cookie(KNOWN_BROWSER_COOKIE_NAME, token, KNOWN_BROWSER_COOKIE_OPTIONS);
}

// ─── Public error codes (ISSUE_051) ──────────────────────────────────────────
// `/reset-password` and `/2fa/verify-login` are reachable without a session, and
// both used to echo `error.message` straight back. As long as the exception comes
// from business code that message is a curated code, but a failure raised by the
// data layer (a Prisma `findUniqueOrThrow`, for instance) describes the model and
// operation involved. Only the codes listed here may leave the process; anything
// else goes to the error middleware (#467): 503 while the database is down, 500
// otherwise, logged server-side only.
const PUBLIC_AUTH_ERROR_CODES = new Set([
  '2FA_ALREADY_ENABLED',
  '2FA_NOT_ENABLED',
  '2FA_SECRET_NOT_GENERATED',
  '2FA_TEMPORARILY_LOCKED',
  'INVALID_CODE',
  'INVALID_CREDENTIALS',
  'INVALID_OR_EXPIRED_TOKEN',
  'INVALID_TOTP_CODE',
  'NOT_A_PENDING_TOKEN',
  'PASSWORD_TOO_LONG',
  'PASSWORD_TOO_SHORT',
  'TOKEN_INVALID_OR_EXPIRED',
  'REGISTRATION_CONFLICT',
  'REGISTRATION_CLOSED',
  'TWO_FACTOR_DISABLED',
  'VALIDATION_ERROR',
]);

const CONFLICT_REGISTER_CODES = new Set(['REGISTRATION_CONFLICT']);
const FORBIDDEN_REGISTER_CODES = new Set(['REGISTRATION_CLOSED']);

/**
 * The allow-listed code of a business refusal, never a raw message. Any other
 * failure is rethrown for the error middleware to answer and log (#467).
 */
function publicAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (PUBLIC_AUTH_ERROR_CODES.has(message)) return message;
  throw error;
}

/**
 * #889: the 2FA lock is a throttling decision, answered 429 like at sign-in
 * (ISSUE_043); any other refusal of a 2FA step-up is a 400.
 */
function stepUpStatus(code: string): number {
  return code === '2FA_TEMPORARILY_LOCKED' ? 429 : 400;
}

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
  return readTrustedDevice(req)?.token;
}

/** The raw device token in a valid trusted-device cookie, and when that cookie expires (#766). */
function readTrustedDevice(req: Request): { token: string; expiresAt?: Date } | undefined {
  const wrapped = (req.cookies as Record<string, string | undefined>)?.[TRUSTED_DEVICE_COOKIE_NAME];
  if (!wrapped) return undefined;
  const secret = process.env.JWT_SECRET;
  if (!secret) return undefined;
  try {
    const payload = jwt.verify(wrapped, secret);
    if (typeof payload === 'object' && payload !== null) {
      const { tdt, exp } = payload as { tdt?: unknown; exp?: unknown };
      if (typeof tdt === 'string') return { token: tdt, expiresAt: typeof exp === 'number' ? new Date(exp * 1000) : undefined };
    }
    return undefined;
  } catch {
    // Expired/invalid/missing trusted-device cookie is the routine case on
    // every login from a device whose 30-day window lapsed — not a
    // malfunction, so not worth a log line on every such request.
    return undefined;
  }
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const data = registerSchema.parse(req.body);
    const { user, token, knownBrowserToken } = await authService.register(data, readDeviceInfo(req));

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    setKnownBrowserCookie(res, knownBrowserToken);
    void auditLog({ userId: user.id, action: 'REGISTER', status: 'success', ip });
    res.status(201).json({ data: user });
  } catch (error) {
    // A ZodError reaches the error middleware too: 400 VALIDATION_ERROR.
    if (error instanceof ZodError) throw error;
    const msg = publicAuthError(error);
    const status = FORBIDDEN_REGISTER_CODES.has(msg) ? 403 : CONFLICT_REGISTER_CODES.has(msg) ? 409 : 400;
    res.status(status).json({ error: msg });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

/**
 * #980/#988: notes the trusted device, or else the known browser, a sign-in
 * comes from, when its cookie belongs to the account the identifier names,
 * for the sign-in limiter to skip that identifier's budget (see
 * signInAccountLimiter). Without a valid cookie (the only case a stranger can
 * produce) the account is not looked up.
 */
async function resolveSignInProof(req: Request, res: Response, next: NextFunction): Promise<void> {
  const identifier = (req.body as { identifier?: unknown } | undefined)?.identifier;
  if (typeof identifier !== 'string') {
    next();
    return;
  }
  const deviceToken = readTrustedDeviceCookie(req);
  const deviceId = deviceToken ? await authService.signInTrustedDeviceId(identifier, deviceToken, getClientIp(req)) : null;
  if (deviceId) {
    res.locals.signInProof = `device:${deviceId}`;
  } else {
    const browserCookie = (req.cookies as Record<string, string | undefined>)?.[KNOWN_BROWSER_COOKIE_NAME];
    const browserId = browserCookie ? await authService.signInKnownBrowserId(identifier, browserCookie) : null;
    if (browserId) res.locals.signInProof = `browser:${browserId}`;
  }
  next();
}

// #980: one LOGIN_FAILED row per locked identifier and window, under its account.
const signInLimiter = signInAccountLimiter((identifier, req) => {
  void authService.auditSignInLocked(identifier, getClientIp(req));
});

router.post('/login', resolveSignInProof, signInLimiter, async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const data = loginSchema.parse(req.body);
    const trustedDeviceToken = readTrustedDeviceCookie(req);
    const result: LoginResult = await authService.login(data, readDeviceInfo(req), trustedDeviceToken);
    const { user, token, requires2fa, rememberMe } = result;

    const cookieOpts = rememberMe ? COOKIE_OPTIONS : SESSION_COOKIE_OPTIONS;
    res.cookie(COOKIE_NAME, token, cookieOpts);
    if (!requires2fa) {
      setKnownBrowserCookie(res, result.knownBrowserToken);
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
    const msg = error instanceof Error ? error.message : '';
    // Always 401 for invalid credentials (no enumeration). A deactivated account
    // is collapsed to the same code so it neither leaks the account's existence
    // nor reads as an application failure. Anything else (the database down)
    // is not a wrong password: the error middleware answers it (#467).
    if (msg !== 'INVALID_CREDENTIALS' && msg !== 'ACCOUNT_DEACTIVATED') throw error;
    res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
});

// ─── POST /api/auth/2fa/verify-login ──────────────────────────────────────────

router.post('/2fa/verify-login', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  // Hoisted out of the try so the catch block can audit a lockout against the
  // right account (ISSUE_043). Empty until the pending token is decoded.
  let userId = '';
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
      // Expired/invalid pending-2FA token is routine (the user took too
      // long, or already used/retried) — not a malfunction worth logging.
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
    setKnownBrowserCookie(res, result.knownBrowserToken);
    void auditLog({ userId: result.user.id, action: 'LOGIN_2FA', status: 'success', ip });
    res.json({ data: result.user });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const msg = publicAuthError(error);
    // ISSUE_043: a locked account is a throttling decision, not a credential
    // rejection — 429 so clients (and operators reading logs) can tell them apart.
    if (msg === '2FA_TEMPORARILY_LOCKED') {
      if (userId) void auditLog({ userId, action: 'LOGIN_2FA', status: 'error', ip, details: { reason: '2fa_locked' } });
      res.status(429).json({ error: msg });
      return;
    }
    res.status(401).json({ error: msg });
  }
});

// ─── POST /api/auth/2fa/generate ──────────────────────────────────────────────

router.post('/2fa/generate', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await authService.generateTwoFactorSecret(req.userId);
    res.json({ data });
  } catch (error) {
    res.status(400).json({ error: publicAuthError(error) });
  }
});

// ─── POST /api/auth/2fa/turn-on ───────────────────────────────────────────────

router.post('/2fa/turn-on', authMiddleware, passwordCheckLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { password, code } = turnOn2faSchema.parse(req.body);
    const data = await authService.turnOnTwoFactorAuthentication(req.userId, password, code, readDeviceInfo(req));
    res.json({ data });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    res.status(400).json({ error: publicAuthError(error) });
  }
});

// ─── POST /api/auth/2fa/turn-off ──────────────────────────────────────────────

router.post('/2fa/turn-off', authMiddleware, passwordCheckLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { password, code } = turnOff2faSchema.parse(req.body);
    await authService.turnOffTwoFactorAuthentication(req.userId, password, readDeviceInfo(req), req.sessionId, code);
    res.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const msg = publicAuthError(error);
    res.status(stepUpStatus(msg)).json({ error: msg });
  }
});

// ─── POST /api/auth/2fa/backup-codes ──────────────────────────────────────────
// #638: new backup codes, the old ones invalidated. Rate-limited with the rest
// of /api/auth/2fa (app.ts). The codes are returned once and never logged.

router.post('/2fa/backup-codes', authMiddleware, passwordCheckLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { password, code } = regenerateBackupCodesSchema.parse(req.body);
    const data = await authService.regenerateBackupCodes(req.userId, password, code, readDeviceInfo(req));
    res.json({ data });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const msg = publicAuthError(error);
    res.status(stepUpStatus(msg)).json({ error: msg });
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
      // Session already gone/invalid — the routine case on a double logout
      // or an already-expired session, not a malfunction. Logout must still
      // succeed client-side either way.
    }
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  void auditLog({ userId: req.userId, action: 'LOGOUT', status: 'success', ip });
  res.json({ data: { ok: true } });
});

// ─── GET /api/auth/sessions ────────────────────────────────────────────────────

router.get('/sessions', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const sessions = await authService.listSessions(req.userId, req.sessionId);
  res.json({ data: sessions });
});

// ─── DELETE /api/auth/sessions ─────────────────────────────────────────────────
// #773: signs out every session of the caller except the current one.

router.delete('/sessions', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const revoked = await authService.revokeAllOtherSessions(req.userId, req.sessionId, readDeviceInfo(req));
  res.json({ data: { revoked } });
});

// ─── DELETE /api/auth/sessions/:id ─────────────────────────────────────────────

router.delete('/sessions/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ip = getClientIp(req);
  try {
    await authService.revokeSession(req.userId, routeParam(req.params.id));
    void auditLog({ userId: req.userId, action: 'SESSION_REVOKE', status: 'success', ip, details: { sessionId: routeParam(req.params.id) } });
    res.json({ data: { ok: true } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    if (msg === 'NOT_FOUND') {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    next(error);
  }
});

// ─── GET /api/auth/trust-device ────────────────────────────────────────────────
// #766: whether this device skips the 2FA code, and until when — the cookie is
// httpOnly, so the page cannot tell by itself.

router.get('/trust-device', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const device = readTrustedDevice(req);
  const trustedUntil = await authService.trustedDeviceUntil(req.userId, device?.token, device?.expiresAt);
  res.json({ data: { trustedUntil } });
});

// ─── POST /api/auth/trust-device ───────────────────────────────────────────────

router.post('/trust-device', authMiddleware, passwordCheckLimiter, async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const { password, code } = trustDeviceSchema.parse(req.body);
    const { token } = await authService.trustCurrentDevice(req.userId, readDeviceInfo(req), password, code);
    res.cookie(TRUSTED_DEVICE_COOKIE_NAME, packTrustedDeviceToken(token), TRUSTED_DEVICE_COOKIE_OPTIONS);
    void auditLog({ userId: req.userId, action: 'TRUST_DEVICE', status: 'success', ip });
    res.json({ data: { ok: true } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR' });
      return;
    }
    const msg = publicAuthError(error);
    void auditLog({ userId: req.userId, action: 'TRUST_DEVICE', status: 'error', ip, details: { message: msg } });
    res.status(stepUpStatus(msg)).json({ error: msg });
  }
});

// ─── DELETE /api/auth/trust-device ─────────────────────────────────────────────

router.delete('/trust-device', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  const trustedDeviceToken = readTrustedDeviceCookie(req);
  if (trustedDeviceToken) {
    await authService.untrustCurrentDevice(req.userId, trustedDeviceToken);
  }
  res.clearCookie(TRUSTED_DEVICE_COOKIE_NAME, { path: '/api/auth' });
  void auditLog({ userId: req.userId, action: 'UNTRUST_DEVICE', status: 'success', ip });
  res.json({ data: { ok: true } });
});

// ─── Quick Lock & Auto-Lock (FEAT-30) ─────────────────────────────────────────
// Client-side lock only: the session/JWT stays valid throughout, these routes
// never mint a new token. See auth.service.ts (setPin/removePin/verifyUnlock).

// ─── POST /api/auth/pin ────────────────────────────────────────────────────────

router.post('/pin', authMiddleware, passwordCheckLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
    next(error);
  }
});

// ─── DELETE /api/auth/pin ───────────────────────────────────────────────────────

router.delete('/pin', authMiddleware, passwordCheckLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
    next(error);
  }
});

// ─── POST /api/auth/unlock ───────────────────────────────────────────────────────
// Verifies password OR PIN to lift the client-side lock. Never touches the
// Session/JWT — this is a pure secret check, not a re-authentication.

router.post('/unlock', unlockLimiter, authMiddleware, unlockAccountLimiter, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
    next(error);
  }
});

// ─── GET /api/auth/smtp-status ────────────────────────────────────────────────

router.get('/smtp-status', async (_req: Request, res: Response): Promise<void> => {
  const smtpEnabled = await systemConfigService.isSmtpEnabled();
  res.json({ data: { smtpEnabled } });
});

// ─── GET /api/auth/registration-status ───────────────────────────────────────

// Lets the login screen hide its signup link when registrations are closed.
// The first account always gets through (see authService.register), so an
// empty instance reports open.
router.get('/registration-status', async (_req: Request, res: Response): Promise<void> => {
  const registrationOpen = (await systemConfigService.isRegistrationOpen()) || (await prisma.user.count()) === 0;
  res.json({ data: { registrationOpen } });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────

router.post('/forgot-password', passwordResetLimiter, (req: Request, res: Response): void => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR' });
    return;
  }
  // Always "ok", account or not, to prevent user enumeration — and answered
  // before the lookup and the e-mail (#607): waiting for the SMTP send told a
  // registered address from an unknown one by the response time alone.
  passwordResetService.requestReset(parsed.data.email).catch((err: unknown) => {
    // A failed send must still leave a trace (#184).
    console.error('[auth] POST /forgot-password failed:', err);
  });
  res.json({ data: { ok: true } });
});

// ─── POST /api/auth/validate-reset-token ─────────────────────────────────────

// Only the service's `valid: false` means the link is dead. A failure of the
// check itself (database down) goes to the error handler, so the reset page
// offers a retry instead of calling a good link invalid (#744).
router.post('/validate-reset-token', async (req: Request, res: Response): Promise<void> => {
  const parsed = validateResetTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR' });
    return;
  }
  const result = await passwordResetService.validateToken(parsed.data.token);
  res.json({ data: result });
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────

router.post('/reset-password', passwordResetLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message);
    const code = ['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'].find((c) => messages.includes(c)) ?? 'VALIDATION_ERROR';
    res.status(400).json({ error: code });
    return;
  }
  try {
    await passwordResetService.resetPassword(parsed.data.token, parsed.data.newPassword, readDeviceInfo(req));
    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(400).json({ error: publicAuthError(err) });
  }
});

export { router as authRouter };
