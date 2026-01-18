import { ProfileRepository } from "../repositories/profile.repository.js";
import { logger } from "../utils/logger.js";
import type { AppSettings, Profile, UpdateAppSettingsInput, UpdateProfileInput, UserRole, UpdateUserInput } from "../schemas/profile.js";
import { Prisma } from "@prisma/client";

export type UserSummary = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  displayName: string | null;
  createdAt: Date;
};

export class ProfileService {
  private repo: ProfileRepository;

  constructor() {
    this.repo = new ProfileRepository();
  }

  async getProfileByUserId(userId: string): Promise<Profile | null> {
    try {
      const user = await this.repo.getProfileByUserId(userId);
      if (!user) return null;

      // Map to Profile type (Prisma result -> Profile schema)
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
        notificationSettings: user.notification_settings ? JSON.parse(JSON.stringify(user.notification_settings)) : undefined,
        aiApiKey: user.ai_api_key,
      } as Profile;
    } catch (error) {
      logger.error({ error, userId }, "Failed to get profile");
      throw new Error("Failed to get profile");
    }
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
    try {
      // Map input to Prisma update data
      const data: Prisma.usersUpdateInput = {
        updated_at: new Date(),
      };

      if (input.displayName !== undefined) data.display_name = input.displayName;
      if (input.avatarUrl !== undefined) data.avatar_url = input.avatarUrl;
      if (input.tagline !== undefined) data.tagline = input.tagline;
      if (input.preferredLocale !== undefined) data.preferred_locale = input.preferredLocale;
      if (input.dateTimeFormat !== undefined) data.date_time_format = input.dateTimeFormat || "system";
      if (input.temperatureUnit !== undefined) data.temperature_unit = input.temperatureUnit || "c";
      if (input.themeMode !== undefined) data.theme_mode = input.themeMode || "dark";
      if (input.accentColor !== undefined) data.accent_color = input.accentColor || "#c5a059";
      if (input.notificationSettings !== undefined) data.notification_settings = input.notificationSettings;
      if (input.aiApiKey !== undefined) data.ai_api_key = input.aiApiKey;

      const updatedUser = await this.repo.updateProfile(userId, data);

      return {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role as UserRole,
        displayName: updatedUser.display_name,
        avatarUrl: updatedUser.avatar_url,
        tagline: updatedUser.tagline,
        preferredLocale: updatedUser.preferred_locale,
        dateTimeFormat: updatedUser.date_time_format,
        temperatureUnit: updatedUser.temperature_unit,
        themeMode: updatedUser.theme_mode,
        accentColor: updatedUser.accent_color,
        notificationSettings: updatedUser.notification_settings,
        aiApiKey: updatedUser.ai_api_key,
      } as Profile;
    } catch (error) {
      logger.error({ error, userId, input }, "Failed to update profile");
      throw new Error("Failed to update profile");
    }
  }

  async listUsers(): Promise<UserSummary[]> {
    try {
      const users = await this.repo.listUsers();
      return users.map(u => ({
        id: u.id!,
        username: u.username!,
        email: u.email!,
        role: u.role as UserRole,
        displayName: u.display_name!,
        createdAt: u.created_at!,
      }));
    } catch (error) {
      logger.error({ error }, "Failed to list users");
      throw new Error("Failed to list users");
    }
  }

  async updateUserRole(userId: string, role: UserRole): Promise<void> {
    try {
      await this.repo.updateUserRole(userId, role);
    } catch (error) {
      logger.error({ error, userId, role }, "Failed to update user role");
      throw new Error("Failed to update user role");
    }
  }

  async updateUser(userId: string, input: UpdateUserInput): Promise<void> {
    try {
      const data: Prisma.usersUpdateInput = {};

      if (input.role) data.role = input.role;
      if (input.displayName !== undefined) data.display_name = input.displayName;
      if (input.email) data.email = input.email;
      if (input.username) data.username = input.username;

      await this.repo.updateProfile(userId, data);
    } catch (error) {
      logger.error({ error, userId, input }, "Failed to update user");
      throw new Error("Failed to update user");
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await this.repo.deleteUser(userId);
    } catch (error) {
      logger.error({ error, userId }, "Failed to delete user");
      throw new Error("Failed to delete user");
    }
  }
}

export class AppSettingsService {
  private repo: ProfileRepository;

  constructor() {
    this.repo = new ProfileRepository();
  }

  async getAppSettings(): Promise<AppSettings & { aiApiKey: string | null }> {
    try {
      let settings = await this.repo.getAppSettings();

      if (!settings) {
        // Fallback or init logic if needed, but for now returning defaults if missing
        return {
          appName: "Glou",
          appTagline: "",
          logoUrl: null,
          aiApiKey: null,
          smtpHost: null,
          smtpPort: null,
          smtpUser: null,
          smtpPass: null,
          smtpFrom: null,
          smtpSecure: false,
          updatedAt: new Date(),
        };
      }

      return {
        appName: settings.app_name,
        appTagline: settings.app_tagline,
        logoUrl: settings.logo_url,
        aiApiKey: settings.ai_api_key,
        smtpHost: settings.smtp_host,
        smtpPort: settings.smtp_port,
        smtpUser: settings.smtp_user,
        smtpPass: settings.smtp_pass,
        smtpFrom: settings.smtp_from,
        smtpSecure: settings.smtp_secure,
        updatedAt: settings.updated_at,
      };
    } catch (error) {
      logger.error({ error }, "Failed to get app settings");
      throw new Error("Failed to get app settings");
    }
  }

  async setAiApiKey(aiApiKey: string | null): Promise<void> {
    try {
      await this.repo.setAiApiKey(aiApiKey || "");
    } catch (error) {
      logger.error({ error, aiApiKey }, "Failed to set AI API key");
      throw new Error("Failed to set AI API key");
    }
  }

  async updateAppSettings(input: UpdateAppSettingsInput): Promise<AppSettings> {
    try {
      const data: Prisma.app_settingsUpdateInput = {
        updated_at: new Date(),
      };

      if (input.appName !== undefined) data.app_name = input.appName;
      if (input.appTagline !== undefined) data.app_tagline = input.appTagline;
      if (input.logoUrl !== undefined) data.logo_url = input.logoUrl;
      if (input.smtpHost !== undefined) data.smtp_host = input.smtpHost;
      if (input.smtpPort !== undefined) data.smtp_port = input.smtpPort;
      if (input.smtpUser !== undefined) data.smtp_user = input.smtpUser;
      if (input.smtpPass !== undefined) data.smtp_pass = input.smtpPass;
      if (input.smtpFrom !== undefined) data.smtp_from = input.smtpFrom;
      if (input.smtpSecure !== undefined) data.smtp_secure = input.smtpSecure;

      const settings = await this.repo.updateAppSettings(data);

      return {
        appName: settings.app_name,
        appTagline: settings.app_tagline,
        logoUrl: settings.logo_url,
        smtpHost: settings.smtp_host,
        smtpPort: settings.smtp_port,
        smtpUser: settings.smtp_user,
        smtpPass: settings.smtp_pass,
        smtpFrom: settings.smtp_from,
        smtpSecure: settings.smtp_secure,
        updatedAt: settings.updated_at,
      };
    } catch (error) {
      logger.error({ error, input }, "Failed to update app settings");
      throw new Error("Failed to update app settings");
    }
  }
}
