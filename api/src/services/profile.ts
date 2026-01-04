import { DatabaseService } from "./database.js";
import { logger } from "../utils/logger.js";
import type { AppSettings, Profile, UpdateAppSettingsInput, UpdateProfileInput, UserRole } from "../schemas/profile.js";

export type UserSummary = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  displayName: string | null;
  createdAt: Date;
};

export class ProfileService {
  constructor(private db: DatabaseService) {}

  async getProfileByUserId(userId: string): Promise<Profile | null> {
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
        notification_settings as "notificationSettings"
      FROM users
      WHERE id = $1
    `;

    try {
      const result = await this.db.query(query, [userId]);
      return (result.rows[0] as Profile) || null;
    } catch (error) {
      logger.error({ error, userId }, "Failed to get profile");
      throw new Error("Failed to get profile");
    }
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
    const fields: { column: string; key: keyof UpdateProfileInput }[] = [
      { column: "display_name", key: "displayName" },
      { column: "avatar_url", key: "avatarUrl" },
      { column: "tagline", key: "tagline" },
      { column: "preferred_locale", key: "preferredLocale" },
      { column: "date_time_format", key: "dateTimeFormat" },
      { column: "temperature_unit", key: "temperatureUnit" },
      { column: "theme_mode", key: "themeMode" },
      { column: "accent_color", key: "accentColor" },
      { column: "notification_settings", key: "notificationSettings" },
    ];

    const setParts: string[] = [];
    const params: unknown[] = [];

    for (const field of fields) {
      if (typeof input[field.key] === "undefined") continue;
      params.push(field.key === "notificationSettings" ? JSON.stringify(input[field.key]) : (input as any)[field.key]);
      setParts.push(`${field.column} = $${params.length}`);
    }

    params.push(userId);

    const query = `
      UPDATE users
      SET ${setParts.length ? setParts.join(", ") + "," : ""} updated_at = NOW()
      WHERE id = $${params.length}
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
        notification_settings as "notificationSettings"
    `;

    try {
      const result = await this.db.query(query, params);
      const profile = result.rows[0] as Profile | undefined;
      if (!profile) {
        throw new Error("Profile not found");
      }
      return profile;
    } catch (error) {
      logger.error({ error, userId, input }, "Failed to update profile");
      throw new Error("Failed to update profile");
    }
  }

  async listUsers(): Promise<UserSummary[]> {
    const query = `
      SELECT
        id,
        username,
        email,
        role,
        display_name as "displayName",
        created_at as "createdAt"
      FROM users
      ORDER BY created_at ASC
    `;

    try {
      const result = await this.db.query(query, []);
      return result.rows as UserSummary[];
    } catch (error) {
      logger.error({ error }, "Failed to list users");
      throw new Error("Failed to list users");
    }
  }

  async updateUserRole(userId: string, role: UserRole): Promise<void> {
    const query = `
      UPDATE users
      SET role = $1, updated_at = NOW()
      WHERE id = $2
    `;

    try {
      await this.db.query(query, [role, userId]);
    } catch (error) {
      logger.error({ error, userId, role }, "Failed to update user role");
      throw new Error("Failed to update user role");
    }
  }
}

export class AppSettingsService {
  constructor(private db: DatabaseService) {}

  async getAppSettings(): Promise<AppSettings> {
    const query = `
      SELECT
        app_name as "appName",
        app_tagline as "appTagline",
        logo_url as "logoUrl",
        updated_at as "updatedAt"
      FROM app_settings
      WHERE id = TRUE
    `;

    try {
      const result = await this.db.query(query, []);
      const row = result.rows[0] as AppSettings | undefined;
      if (row) return row;

      // Shouldn't happen due to init, but keep it safe.
      await this.db.query(
        `INSERT INTO app_settings (id, app_name, app_tagline, logo_url) VALUES (TRUE, NULL, NULL, NULL) ON CONFLICT (id) DO NOTHING`,
        []
      );
      const again = await this.db.query(query, []);
      return again.rows[0] as AppSettings;
    } catch (error) {
      logger.error({ error }, "Failed to get app settings");
      throw new Error("Failed to get app settings");
    }
  }

  async updateAppSettings(input: UpdateAppSettingsInput): Promise<AppSettings> {
    const fields: { column: string; key: keyof UpdateAppSettingsInput }[] = [
      { column: "app_name", key: "appName" },
      { column: "app_tagline", key: "appTagline" },
      { column: "logo_url", key: "logoUrl" },
    ];

    const setParts: string[] = [];
    const params: unknown[] = [];

    for (const field of fields) {
      if (typeof input[field.key] === "undefined") continue;
      params.push((input as any)[field.key]);
      setParts.push(`${field.column} = $${params.length}`);
    }

    const query = `
      UPDATE app_settings
      SET ${setParts.length ? setParts.join(", ") + "," : ""} updated_at = NOW()
      WHERE id = TRUE
      RETURNING
        app_name as "appName",
        app_tagline as "appTagline",
        logo_url as "logoUrl",
        updated_at as "updatedAt"
    `;

    try {
      const result = await this.db.query(query, params);
      return result.rows[0] as AppSettings;
    } catch (error) {
      logger.error({ error, input }, "Failed to update app settings");
      throw new Error("Failed to update app settings");
    }
  }
}
