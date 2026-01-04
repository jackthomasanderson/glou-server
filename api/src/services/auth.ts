import { v4 as uuidv4 } from "uuid";
import { User, UserRegistration, LoginCredentials, TwoFASettings, Session } from "../schemas/auth.js";
import { DatabaseService } from "./database.js";
import { logger } from "../utils/logger.js";

/**
 * User management service
 */
export class UserService {
  constructor(private db: DatabaseService) {}

  private async hasAnyUser(): Promise<boolean> {
    const query = `SELECT 1 FROM users LIMIT 1`;
    const result = await this.db.query(query, []);
    return result.rows.length > 0;
  }

  /**
   * Create a new user (registration)
   */
  async createUser(registration: UserRegistration, passwordHash: string): Promise<User> {
    const userId = uuidv4();
    const now = new Date();

    const isFirstUser = !(await this.hasAnyUser());
    const role = isFirstUser ? "admin" : "user";

    const query = `
      INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        username,
        email,
        role,
        display_name as "displayName",
        avatar_url as "avatarUrl",
        tagline,
        preferred_locale as "preferredLocale",
        date_time_format as "dateTimeFormat",
        temperature_unit as "temperatureUnit",
        theme_mode as "themeMode",
        accent_color as "accentColor",
        notification_settings as "notificationSettings",
        password_hash as "passwordHash",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    try {
      const result = await this.db.query(query, [userId, registration.username, registration.email, passwordHash, role, now, now]);
      return result.rows[0] as User;
    } catch (error) {
      logger.error({ error, registration }, "Failed to create user");
      throw new Error("Failed to create user");
    }
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    const query = `
      SELECT
        id,
        username,
        email,
        role,
        display_name as "displayName",
        avatar_url as "avatarUrl",
        tagline,
        preferred_locale as "preferredLocale",
        date_time_format as "dateTimeFormat",
        temperature_unit as "temperatureUnit",
        theme_mode as "themeMode",
        accent_color as "accentColor",
        notification_settings as "notificationSettings",
        password_hash as "passwordHash",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM users
      WHERE username = $1
    `;

    try {
      const result = await this.db.query(query, [username]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ error, username }, "Failed to get user by username");
      throw new Error("Failed to get user");
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT
        id,
        username,
        email,
        role,
        display_name as "displayName",
        avatar_url as "avatarUrl",
        tagline,
        preferred_locale as "preferredLocale",
        date_time_format as "dateTimeFormat",
        temperature_unit as "temperatureUnit",
        theme_mode as "themeMode",
        accent_color as "accentColor",
        notification_settings as "notificationSettings",
        password_hash as "passwordHash",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM users
      WHERE email = $1
    `;

    try {
      const result = await this.db.query(query, [email]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ error, email }, "Failed to get user by email");
      throw new Error("Failed to get user");
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const query = `
      SELECT
        id,
        username,
        email,
        role,
        display_name as "displayName",
        avatar_url as "avatarUrl",
        tagline,
        preferred_locale as "preferredLocale",
        date_time_format as "dateTimeFormat",
        temperature_unit as "temperatureUnit",
        theme_mode as "themeMode",
        accent_color as "accentColor",
        notification_settings as "notificationSettings",
        password_hash as "passwordHash",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM users
      WHERE id = $1
    `;

    try {
      const result = await this.db.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ error, userId }, "Failed to get user by ID");
      throw new Error("Failed to get user");
    }
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPasswordHash: string): Promise<void> {
    const query = `
      UPDATE users
      SET password_hash = $1, updated_at = $2
      WHERE id = $3
    `;

    try {
      await this.db.query(query, [newPasswordHash, new Date(), userId]);
    } catch (error) {
      logger.error({ error, userId }, "Failed to update password");
      throw new Error("Failed to update password");
    }
  }
}

/**
 * 2FA management service
 */
export class TwoFAService {
  constructor(private db: DatabaseService) {}

  /**
   * Get 2FA settings for user
   */
  async getTwoFASettings(userId: string): Promise<TwoFASettings | null> {
    const query = `
      SELECT id, user_id as "userId", method, totp_secret as "totpSecret",
             webauthn_credentials as "webauthnCredentials",
             recovery_codes_hash as "recoveryCodesHash",
             enabled_at as "enabledAt", created_at as "createdAt", updated_at as "updatedAt"
      FROM two_fa_settings
      WHERE user_id = $1
    `;

    try {
      const result = await this.db.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ error, userId }, "Failed to get 2FA settings");
      throw new Error("Failed to get 2FA settings");
    }
  }

  /**
   * Initialize 2FA settings for user
   */
  async initializeTwoFASettings(userId: string): Promise<TwoFASettings> {
    const settingsId = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO two_fa_settings (id, user_id, method, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id as "userId", method, totp_secret as "totpSecret",
                webauthn_credentials as "webauthnCredentials",
                recovery_codes_hash as "recoveryCodesHash",
                enabled_at as "enabledAt", created_at as "createdAt", updated_at as "updatedAt"
    `;

    try {
      const result = await this.db.query(query, [settingsId, userId, "none", now, now]);
      return result.rows[0];
    } catch (error) {
      logger.error({ error, userId }, "Failed to initialize 2FA settings");
      throw new Error("Failed to initialize 2FA settings");
    }
  }

  /**
   * Store TOTP secret
   */
  async storeTOTPSecret(userId: string, secret: string, recoveryCodesHash: string[]): Promise<void> {
    const query = `
      UPDATE two_fa_settings
      SET totp_secret = $1, recovery_codes_hash = $2, method = $3, enabled_at = $4, updated_at = $5
      WHERE user_id = $6
    `;

    try {
      await this.db.query(query, [secret, JSON.stringify(recoveryCodesHash), "totp", new Date(), new Date(), userId]);
    } catch (error) {
      logger.error({ error, userId }, "Failed to store TOTP secret");
      throw new Error("Failed to store TOTP secret");
    }
  }

  /**
   * Disable 2FA
   */
  async disableTwoFA(userId: string): Promise<void> {
    const query = `
      UPDATE two_fa_settings
      SET method = $1, totp_secret = NULL, webauthn_credentials = NULL,
          recovery_codes_hash = NULL, enabled_at = NULL, updated_at = $2
      WHERE user_id = $3
    `;

    try {
      await this.db.query(query, ["none", new Date(), userId]);
    } catch (error) {
      logger.error({ error, userId }, "Failed to disable 2FA");
      throw new Error("Failed to disable 2FA");
    }
  }
}

/**
 * Session management service
 */
export class SessionService {
  constructor(private db: DatabaseService) {}

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    token: string,
    deviceName?: string,
    ipAddress?: string,
    durationDays: number = 30
  ): Promise<Session> {
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const query = `
      INSERT INTO sessions (id, user_id, token, device_name, ip_address, is_trusted, last_activity_at, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, user_id as "userId", token, device_name as "deviceName", ip_address as "ipAddress",
                is_trusted as "isTrusted", last_activity_at as "lastActivityAt", expires_at as "expiresAt", created_at as "createdAt"
    `;

    try {
      const result = await this.db.query(query, [
        sessionId,
        userId,
        token,
        deviceName || null,
        ipAddress || null,
        false,
        now,
        expiresAt,
        now,
      ]);
      return result.rows[0];
    } catch (error) {
      logger.error({ error, userId }, "Failed to create session");
      throw new Error("Failed to create session");
    }
  }

  /**
   * Get session by token
   */
  async getSessionByToken(token: string): Promise<(Session & { userId: string }) | null> {
    const query = `
      SELECT id, user_id as "userId", token, device_name as "deviceName", ip_address as "ipAddress",
             is_trusted as "isTrusted", last_activity_at as "lastActivityAt", expires_at as "expiresAt", created_at as "createdAt"
      FROM sessions
      WHERE token = $1 AND expires_at > NOW()
    `;

    try {
      const result = await this.db.query(query, [token]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ error }, "Failed to get session by token");
      throw new Error("Failed to get session");
    }
  }

  /**
   * List user sessions
   */
  async listUserSessions(userId: string): Promise<Session[]> {
    const query = `
      SELECT id, user_id as "userId", token, device_name as "deviceName", ip_address as "ipAddress",
             is_trusted as "isTrusted", last_activity_at as "lastActivityAt", expires_at as "expiresAt", created_at as "createdAt"
      FROM sessions
      WHERE user_id = $1 AND expires_at > NOW()
      ORDER BY last_activity_at DESC
    `;

    try {
      const result = await this.db.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error({ error, userId }, "Failed to list user sessions");
      throw new Error("Failed to list sessions");
    }
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string): Promise<void> {
    const query = `
      DELETE FROM sessions
      WHERE id = $1
    `;

    try {
      await this.db.query(query, [sessionId]);
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to revoke session");
      throw new Error("Failed to revoke session");
    }
  }

  /**
   * Revoke all user sessions except current
   */
  async revokeAllUserSessionsExcept(userId: string, exceptSessionId: string): Promise<void> {
    const query = `
      DELETE FROM sessions
      WHERE user_id = $1 AND id != $2
    `;

    try {
      await this.db.query(query, [userId, exceptSessionId]);
    } catch (error) {
      logger.error({ error, userId }, "Failed to revoke all user sessions");
      throw new Error("Failed to revoke all sessions");
    }
  }

  /**
   * Update session last activity
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    const query = `
      UPDATE sessions
      SET last_activity_at = NOW()
      WHERE id = $1
    `;

    try {
      await this.db.query(query, [sessionId]);
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to update session activity");
      throw new Error("Failed to update session activity");
    }
  }

  /**
   * Trust device
   */
  async trustDevice(sessionId: string, trustDurationDays: number = 90): Promise<void> {
    const query = `
      UPDATE sessions
      SET is_trusted = true
      WHERE id = $1
    `;

    try {
      await this.db.query(query, [sessionId]);
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to trust device");
      throw new Error("Failed to trust device");
    }
  }
}

/**
 * Security events logging service
 */
export class SecurityEventService {
  constructor(private db: DatabaseService) {}

  /**
   * Log a security event
   */
  async logEvent(
    userId: string,
    eventType: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const eventId = uuidv4();

    const query = `
      INSERT INTO security_events (id, user_id, event_type, ip_address, user_agent, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    try {
      await this.db.query(query, [eventId, userId, eventType, ipAddress || null, userAgent || null, JSON.stringify(metadata || {}), new Date()]);
    } catch (error) {
      logger.error({ error, userId, eventType }, "Failed to log security event");
    }
  }

  /**
   * Get recent events for user
   */
  async getRecentEvents(userId: string, limit: number = 20): Promise<any[]> {
    const query = `
      SELECT id, user_id as "userId", event_type as "eventType", ip_address as "ipAddress",
             user_agent as "userAgent", metadata, created_at as "createdAt"
      FROM security_events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    try {
      const result = await this.db.query(query, [userId, limit]);
      return result.rows;
    } catch (error) {
      logger.error({ error, userId }, "Failed to get security events");
      throw new Error("Failed to get security events");
    }
  }
}
