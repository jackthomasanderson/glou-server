import { Router, Response } from "express";
import { ZodError } from "zod";
import { UserService, TwoFAService, SessionService, SecurityEventService } from "../services/auth.js";
import { DatabaseService } from "../services/database.js";
import { ProfileService } from "../services/profile.js";
import { CryptoService, TOTPService } from "../services/crypto.js";
import {
  userRegistrationSchema,
  loginCredentialsSchema,
  totpVerifySchema,
  User,
} from "../schemas/auth.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";

export function createAuthRouter(
  userService: UserService,
  twoFAService: TwoFAService,
  sessionService: SessionService,
  securityEventService: SecurityEventService
): Router {
  const router = Router();
  const profileService = new ProfileService(userService.db);

  /**
   * POST /auth/register
   * Register a new user
   */
  router.post("/register", async (req, res: Response) => {
    try {
      const payload = userRegistrationSchema.parse(req.body);
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress;

      // Check if user exists
      const existingUser = await userService.getUserByUsername(payload.username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const existingEmail = await userService.getUserByEmail(payload.email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Hash password
      const passwordHash = await CryptoService.hashPassword(payload.password);

      // Create user
      const user = await userService.createUser(payload, passwordHash);

      // Initialize 2FA settings
      await twoFAService.initializeTwoFASettings(user.id);

      // Log security event
      await securityEventService.logEvent(user.id, "account_created", ipAddress, req.headers["user-agent"] as string);

      res.status(201).json({
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      logger.error(error, "Registration error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /auth/login
   * Authenticate user and create session
   */
  router.post("/login", async (req, res: Response) => {
    try {
      const payload = loginCredentialsSchema.parse(req.body);
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"] as string;

      // Get user
      let user = await userService.getUserByUsername(payload.username);
      if (!user && payload.username.includes("@")) {
        user = await userService.getUserByEmail(payload.username);
      }
      if (!user) {
        await securityEventService.logEvent(null as any, "login_failed", ipAddress, userAgent, { reason: "user_not_found" });
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Verify password
      const isValid = await CryptoService.verifyPassword(payload.password, user.passwordHash);
      if (!isValid) {
        await securityEventService.logEvent(user.id, "login_failed", ipAddress, userAgent, { reason: "invalid_password" });
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Get 2FA settings
      const twoFASettings = await twoFAService.getTwoFASettings(user.id);

      // If 2FA enabled, return partial response
      if (twoFASettings && twoFASettings.method !== "none") {
        const tempToken = CryptoService.generateToken();
        // Store temp token in memory or cache for short duration (e.g., 5 minutes)
        // For now, return it in response (client should store it)

        return res.json({
          requiresTwoFA: true,
          tempToken,
          twoFAMethod: twoFASettings.method,
          userId: user.id,
        });
      }

      // Create session
      const sessionToken = CryptoService.generateToken();
      const session = await sessionService.createSession(user.id, sessionToken, undefined, ipAddress);

      // Log successful login
      await securityEventService.logEvent(user.id, "login_success", ipAddress, userAgent);

      res.cookie("session_token", sessionToken, {
        httpOnly: false,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.json({
        data: {
          sessionId: session.id,
          sessionToken,
          userId: user.id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      logger.error(error, "Login error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /auth/verify-2fa
   * Verify 2FA code
   */
  router.post("/verify-2fa", async (req, res: Response) => {
    try {
      const { userId, code, recoveryCode, twoFAMethod, tempToken } = req.body;
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress;
      const userAgent = req.headers["user-agent"] as string;

      if (!userId || (!code && !recoveryCode)) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get user
      const user = await userService.getUserById(userId);
      if (!user) {
        return res.status(401).json({ error: "Invalid user" });
      }

      // Get 2FA settings
      const twoFASettings = await twoFAService.getTwoFASettings(userId);
      if (!twoFASettings || twoFASettings.method === "none") {
        return res.status(400).json({ error: "2FA not enabled" });
      }

      let isValid = false;

      // Verify recovery code
      if (recoveryCode && twoFASettings.recoveryCodesHash) {
        const hashedRecoveryCode = CryptoService.hashRecoveryCode(recoveryCode);
        isValid = (twoFASettings.recoveryCodesHash as any[]).includes(hashedRecoveryCode);

        if (isValid) {
          // Remove used recovery code
          const updatedCodes = (twoFASettings.recoveryCodesHash as any[]).filter((h) => h !== hashedRecoveryCode);
          await twoFAService.storeTOTPSecret(userId, twoFASettings.totpSecret!, updatedCodes);
        }
      }

      // Verify TOTP code
      if (code && twoFASettings.method === "totp" && twoFASettings.totpSecret) {
        isValid = TOTPService.verifyCode(twoFASettings.totpSecret, code);
      }

      if (!isValid) {
        await securityEventService.logEvent(userId, "2fa_failed", ipAddress, userAgent, { method: twoFAMethod });
        return res.status(401).json({ error: "Invalid 2FA code" });
      }

      // Create session
      const sessionToken = CryptoService.generateToken();
      const session = await sessionService.createSession(user.id, sessionToken, undefined, ipAddress);

      await securityEventService.logEvent(user.id, "login_success", ipAddress, userAgent, { method: "2fa" });

      res.cookie("session_token", sessionToken, {
          httpOnly: false,
          secure: false,
          sameSite: "lax",
          path: "/",
      });

      res.json({
        data: {
          sessionId: session.id,
          sessionToken,
          userId: user.id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (error) {
      logger.error(error, "2FA verification error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /auth/setup-totp
   * Generate TOTP secret for setup
   */
  router.post("/setup-totp", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Generate secret
      const secret = TOTPService.generateSecret();
      const qrCode = TOTPService.generateQRCodeDataURL(secret, "Glou", `user-${req.userId}`);
      const manualEntry = secret;

      // Generate recovery codes
      const recoveryCodes = CryptoService.generateRecoveryCodes();

      res.json({
        data: {
          secret,
          qrCode,
          manualEntry,
          recoveryCodes,
        },
      });
    } catch (error) {
      logger.error(error, "TOTP setup error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /auth/enable-totp
   * Confirm TOTP setup with verification code
   */
  router.post("/enable-totp", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { secret, code, recoveryCodes } = req.body;

      if (!secret || !code || !recoveryCodes) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Verify code
      const isValid = TOTPService.verifyCode(secret, code);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid TOTP code" });
      }

      // Hash recovery codes
      const hashedRecoveryCodes = recoveryCodes.map((code: string) => CryptoService.hashRecoveryCode(code));

      // Store TOTP settings
      await twoFAService.storeTOTPSecret(req.userId, secret, hashedRecoveryCodes);

      // Log event
      await securityEventService.logEvent(req.userId, "2fa_enabled", undefined, undefined, { method: "totp" });

      res.json({ message: "TOTP enabled successfully" });
    } catch (error) {
      logger.error(error, "TOTP enable error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /auth/disable-2fa
   * Disable 2FA
   */
  router.post("/disable-2fa", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Password required to disable 2FA" });
      }

      // Verify password
      const user = await userService.getUserById(req.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const isValid = await CryptoService.verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid password" });
      }

      // Disable 2FA
      await twoFAService.disableTwoFA(req.userId);

      // Log event
      await securityEventService.logEvent(req.userId, "2fa_disabled");

      res.json({ message: "2FA disabled successfully" });
    } catch (error) {
      logger.error(error, "Disable 2FA error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /auth/sessions
   * List user sessions
   */
  router.get("/sessions", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const sessions = await sessionService.listUserSessions(req.userId);

      res.json({
        data: sessions.map((s) => ({
          id: s.id,
          deviceName: s.deviceName,
          ipAddress: s.ipAddress,
          isTrusted: s.isTrusted,
          lastActivityAt: s.lastActivityAt,
          expiresAt: s.expiresAt,
          createdAt: s.createdAt,
          isCurrent: s.id === req.sessionId,
        })),
      });
    } catch (error) {
      logger.error(error, "List sessions error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * DELETE /auth/sessions/:sessionId
   * Revoke a session
   */
  router.delete("/sessions/:sessionId", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { sessionId } = req.params;
      await sessionService.revokeSession(sessionId);

      await securityEventService.logEvent(req.userId, "session_revoked", undefined, undefined, { sessionId });

      res.json({ message: "Session revoked successfully" });
    } catch (error) {
      logger.error(error, "Revoke session error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /auth/trust-device
   * Mark current device as trusted
   */
  router.post("/trust-device", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId || !req.sessionId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { deviceName } = req.body;

      await sessionService.trustDevice(req.sessionId);
      await securityEventService.logEvent(req.userId, "device_trusted", undefined, undefined, { deviceName });

      res.json({ message: "Device marked as trusted" });
    } catch (error) {
      logger.error(error, "Trust device error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /auth/logout
   * Logout user (revoke current session)
   */
  router.post("/logout", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.sessionId) {
        await sessionService.revokeSession(req.sessionId);
      }

      if (req.userId) {
        await securityEventService.logEvent(req.userId, "logout");
      }

      res.clearCookie("session_token");
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      logger.error(error, "Logout error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /auth/me
   * Get current user info
   */
  router.get("/me", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        logger.warn("GET /me - No userId in request after authMiddleware");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const profile = await profileService.getProfileByUserId(req.userId);
      if (!profile) {
        logger.warn({ userId: req.userId }, "User not found");
        return res.status(404).json({ error: "User not found" });
      }

      let twoFASettings = null;
      try {
        twoFASettings = await twoFAService.getTwoFASettings(req.userId);
      } catch (e) {
        logger.error(e, "Failed to get 2FA settings");
        twoFASettings = null;
      }

      res.json({
        data: {
          ...profile,
          twoFAEnabled: twoFASettings?.method !== "none" && twoFASettings !== null,
          twoFAMethod: twoFASettings?.method,
        },
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, "Get user error");
      const devMsg = process.env.NODE_ENV === "production" ? "Internal server error" : String(error);
      res.status(500).json({ error: devMsg });
    }
  });

  /**
   * GET /auth/security-events
   * Get recent security events
   */
  router.get("/security-events", authMiddleware(sessionService), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const events = await securityEventService.getRecentEvents(req.userId, limit);

      res.json({ data: events });
    } catch (error) {
      logger.error(error, "Get security events error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
