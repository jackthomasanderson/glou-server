import { Router, Response, Request } from "express";
import { ZodError } from "zod";
import { UserService, TwoFAService, SecurityEventService } from "../services/auth.js";
import { ProfileService } from "../services/profile.js";
import { CryptoService, TOTPService } from "../services/crypto.js";
import { generateTokens, verifyRefreshToken, TokenPayload } from "../lib/jwt.js";
import { authenticateJWT } from "../middleware/jwt.middleware.js";
import {
  userRegistrationSchema,
  loginCredentialsSchema,
} from "../schemas/auth.js";
import { logger } from "../utils/logger.js";

export function createAuthRouter(
  userService: UserService,
  twoFAService: TwoFAService,
  securityEventService: SecurityEventService
): Router {
  const router = Router();
  const profileService = new ProfileService();

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
   * Authenticate user and return JWT tokens
   */
  router.post("/login", async (req, res: Response) => {
    try {
      const payload = loginCredentialsSchema.parse(req.body);
      const ipAddress = ((req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown") as string;
      const userAgent = (req.headers["user-agent"] || "unknown") as string;

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
        // TODO: Store temp token in Redis or memory cache for 5 minutes
        // For now, return it in response (client should store it)

        return res.json({
          requiresTwoFA: true,
          tempToken,
          twoFAMethod: twoFASettings.method,
          userId: user.id,
        });
      }

      // Generate JWT tokens
      const tokens = generateTokens({
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
      });

      // Log successful login
      await securityEventService.logEvent(user.id, "login_success", ipAddress, userAgent);

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          tagline: user.tagline,
          preferredLocale: user.preferredLocale,
          dateTimeFormat: user.dateTimeFormat,
          temperatureUnit: user.temperatureUnit,
          themeMode: user.themeMode,
          accentColor: user.accentColor,
          twoFAEnabled: !!twoFASettings && twoFASettings.method !== "none",
          twoFAMethod: twoFASettings?.method as "totp" | "webauthn" | undefined,
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
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
   * Verify 2FA code and return JWT tokens
   */
  router.post("/verify-2fa", async (req, res: Response) => {
    try {
      const { userId, code, recoveryCode, twoFAMethod, tempToken, rememberMe } = req.body;
      const ipAddress = ((req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown") as string;
      const userAgent = (req.headers["user-agent"] || "unknown") as string;

      if (!userId || (!code && !recoveryCode)) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // TODO: Verify tempToken is valid and matches userId

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

      // Generate JWT tokens
      const tokens = generateTokens({
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
      });

      await securityEventService.logEvent(user.id, "login_success", ipAddress, userAgent, { method: "2fa" });

      res.json({
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          userId: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      logger.error(error, "2FA verification error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  router.post("/refresh", async (req, res: Response) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: "Refresh token required" });
      }

      const payload = verifyRefreshToken(refreshToken);
      if (!payload) {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
      }

      // Get user to generate new tokens
      const user = await userService.getUserById(payload.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Generate new tokens
      const tokens = generateTokens({
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
      });

      res.json({
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      });
    } catch (error) {
      logger.error(error, "Token refresh error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /auth/setup-totp
   * Generate TOTP secret for setup
   */
  router.post("/setup-totp", authenticateJWT, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Generate secret
      const secret = TOTPService.generateSecret();
      const qrCode = TOTPService.generateQRCodeDataURL(secret, "Glou", `user-${req.user.userId}`);
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
  router.post("/enable-totp", authenticateJWT, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
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
      await twoFAService.storeTOTPSecret(req.user.userId, secret, hashedRecoveryCodes);

      // Log event
      await securityEventService.logEvent(req.user.userId, "2fa_enabled", undefined, undefined, { method: "totp" });

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
  router.post("/disable-2fa", authenticateJWT, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Password required to disable 2FA" });
      }

      // Verify password
      const user = await userService.getUserById(req.user.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const isValid = await CryptoService.verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid password" });
      }

      // Disable 2FA
      await twoFAService.disableTwoFA(req.user.userId);

      // Log event
      await securityEventService.logEvent(req.user.userId, "2fa_disabled");

      res.json({ message: "2FA disabled successfully" });
    } catch (error) {
      logger.error(error, "Disable 2FA error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * PATCH /auth/change-password
   * Change current user password
   */
  router.patch("/change-password", authenticateJWT, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current and new password required" });
      }

      if (newPassword.length < 12) {
        return res.status(400).json({ error: "New password must be at least 12 characters" });
      }

      // Verify current password
      const user = await userService.getUserById(req.user.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const isValid = await CryptoService.verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid current password" });
      }

      // Hash new password
      const newPasswordHash = await CryptoService.hashPassword(newPassword);

      // Update password
      await userService.updatePassword(req.user.userId, newPasswordHash);

      // Log event
      const ipAddress = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress;
      await securityEventService.logEvent(req.user.userId, "password_changed", ipAddress, req.headers["user-agent"] as string);

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      logger.error(error, "Change password error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /auth/logout
   * Logout user (client should discard tokens)
   */
  router.post("/logout", authenticateJWT, async (req: Request, res: Response) => {
    try {
      if (req.user) {
        await securityEventService.logEvent(req.user.userId, "logout");
      }

      // With JWT, logout is handled client-side by discarding tokens
      // Optionally, implement token blacklist for immediate invalidation
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
  router.get("/me", authenticateJWT, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        logger.warn("GET /me - No user in request after authenticateJWT");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const profile = await profileService.getProfileByUserId(req.user.userId);
      if (!profile) {
        logger.warn({ userId: req.user.userId }, "User not found");
        return res.status(404).json({ error: "User not found" });
      }

      let twoFASettings = null;
      try {
        twoFASettings = await twoFAService.getTwoFASettings(req.user.userId);
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
      logger.error({ error, userId: req.user?.userId }, "Get user error");
      const devMsg = process.env.NODE_ENV === "production" ? "Internal server error" : String(error);
      res.status(500).json({ error: devMsg });
    }
  });

  /**
   * GET /auth/security-events
   * Get recent security events
   */
  router.get("/security-events", authenticateJWT, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const events = await securityEventService.getRecentEvents(req.user.userId, limit);

      res.json({ data: events });
    } catch (error) {
      logger.error(error, "Get security events error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
