import { v4 as uuidv4 } from "uuid";
import { User, UserRegistration, TwoFASettings } from "../schemas/auth.js";
import { UserRepository } from "../repositories/user.repository.js";
import { TwoFARepository } from "../repositories/twofa.repository.js";
import { SecurityEventRepository } from "../repositories/securityEvent.repository.js";
import { logger } from "../utils/logger.js";
import { UserRole } from "../schemas/profile.js";

/**
 * User management service
 */
export class UserService {
  public repo: UserRepository;

  constructor() {
    this.repo = new UserRepository();
  }

  private async hasAnyUser(): Promise<boolean> {
    return await this.repo.hasAnyUser();
  }

  /**
   * Create a new user (registration)
   */
  async createUser(registration: UserRegistration, passwordHash: string): Promise<User> {
    const isFirstUser = !(await this.hasAnyUser());
    const role: UserRole = isFirstUser ? "admin" : "user";
    const now = new Date();

    try {
      const userId = uuidv4();

      const user = await this.repo.createUser({
        id: userId,
        username: registration.username,
        email: registration.email,
        password_hash: passwordHash,
        role: role,
        created_at: now,
        updated_at: now,
        display_name: null,
        avatar_url: null,
        tagline: null,
        preferred_locale: "fr",
        date_time_format: "system",
        temperature_unit: "c",
        theme_mode: "dark",
        accent_color: "#c5a059",
        notification_settings: {},
      });

      return this.mapToUser(user);
    } catch (error) {
      console.error("=== ERREUR CRÉATION USER ===");
      console.error(error);
      logger.error({ error, registration }, "Failed to create user");
      throw new Error("Failed to create user");
    }
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    try {
      const user = await this.repo.getUserByUsername(username);
      if (!user) return null;
      return this.mapToUser(user);
    } catch (error) {
      logger.error({ error, username }, "Failed to get user by username");
      throw new Error("Failed to get user");
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.repo.getUserByEmail(email);
      if (!user) return null;
      return this.mapToUser(user);
    } catch (error) {
      logger.error({ error, email }, "Failed to get user by email");
      throw new Error("Failed to get user");
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const user = await this.repo.getUserById(userId);
      if (!user) return null;
      return this.mapToUser(user);
    } catch (error) {
      logger.error({ error, userId }, "Failed to get user by ID");
      throw new Error("Failed to get user");
    }
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPasswordHash: string): Promise<void> {
    try {
      await this.repo.updateUser(userId, {
        password_hash: newPasswordHash,
        updated_at: new Date(),
      });
    } catch (error) {
      logger.error({ error, userId }, "Failed to update password");
      throw new Error("Failed to update password");
    }
  }

  private mapToUser(user: any): User {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as UserRole,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      tagline: user.tagline,
      preferredLocale: user.preferred_locale,
      dateTimeFormat: user.date_time_format,
      temperatureUnit: user.temperature_unit,
      themeMode: user.theme_mode,
      accentColor: user.accent_color,
      notificationSettings: user.notification_settings,
      passwordHash: user.password_hash,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    } as User;
  }
}

/**
 * 2FA management service
 */
export class TwoFAService {
  private repo: TwoFARepository;

  constructor() {
    this.repo = new TwoFARepository();
  }

  /**
   * Get 2FA settings for user
   */
  async getTwoFASettings(userId: string): Promise<TwoFASettings | null> {
    try {
      const settings = await this.repo.getTwoFASettings(userId);
      if (!settings) return null;

      return {
        id: settings.id,
        userId: settings.user_id,
        method: settings.method,
        totpSecret: settings.totp_secret,
        webauthnCredentials: settings.webauthn_credentials,
        recoveryCodesHash: settings.recovery_codes_hash as string[],
        enabledAt: settings.enabled_at,
        createdAt: settings.created_at,
        updatedAt: settings.updated_at,
      } as TwoFASettings;
    } catch (error) {
      logger.error({ error, userId }, "Failed to get 2FA settings");
      throw new Error("Failed to get 2FA settings");
    }
  }

  /**
   * Initialize 2FA settings for user
   */
  async initializeTwoFASettings(userId: string): Promise<TwoFASettings> {
    try {
      const id = uuidv4();
      const now = new Date();

      const settings = await this.repo.createTwoFASettings({
        id,
        users: { connect: { id: userId } },
        method: "none",
        created_at: now,
        updated_at: now,
      });

      return {
        id: settings.id,
        userId: settings.user_id,
        method: settings.method,
        totpSecret: settings.totp_secret,
        webauthnCredentials: settings.webauthn_credentials,
        recoveryCodesHash: settings.recovery_codes_hash as string[],
        enabledAt: settings.enabled_at,
        createdAt: settings.created_at,
        updatedAt: settings.updated_at,
      } as TwoFASettings;
    } catch (error) {
      console.error("=== ERREUR INIT 2FA ===");
      console.error(error);
      logger.error({ error, userId }, "Failed to initialize 2FA settings");
      throw new Error("Failed to initialize 2FA settings");
    }
  }

  /**
   * Store TOTP secret
   */
  async storeTOTPSecret(userId: string, secret: string, recoveryCodesHash: string[]): Promise<void> {
    try {
      await this.repo.enableTwoFA(userId, secret, recoveryCodesHash);
    } catch (error) {
      logger.error({ error, userId }, "Failed to store TOTP secret");
      throw new Error("Failed to store TOTP secret");
    }
  }

  /**
   * Disable 2FA
   */
  async disableTwoFA(userId: string): Promise<void> {
    try {
      await this.repo.disableTwoFA(userId);
    } catch (error) {
      logger.error({ error, userId }, "Failed to disable 2FA");
      throw new Error("Failed to disable 2FA");
    }
  }
}

/**
 * Security events logging service
 */
export class SecurityEventService {
  private repo: SecurityEventRepository;

  constructor() {
    this.repo = new SecurityEventRepository();
  }

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
    try {
      await this.repo.createEvent({
        id: uuidv4(),
        users: userId ? { connect: { id: userId } } : undefined,
        event_type: eventType,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : {}, // Prisma InputJsonValue
        created_at: new Date(),
      });
    } catch (error) {
      logger.error({ error, userId, eventType }, "Failed to log security event");
    }
  }

  /**
   * Get recent events for user
   */
  async getRecentEvents(userId: string, limit: number = 20): Promise<any[]> {
    try {
      const events = await this.repo.getRecentEvents(userId, limit);
      return events.map(e => ({
        id: e.id,
        userId: e.user_id,
        eventType: e.event_type,
        ipAddress: e.ip_address,
        userAgent: e.user_agent,
        metadata: e.metadata,
        createdAt: e.created_at,
      }));
    } catch (error) {
      logger.error({ error, userId }, "Failed to get security events");
      throw new Error("Failed to get security events");
    }
  }
}
