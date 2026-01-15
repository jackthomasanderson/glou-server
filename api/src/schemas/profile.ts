import { z } from "zod";

export const userRoleSchema = z.enum(["admin", "user"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userLocaleSchema = z.enum(["en", "fr"]);
export type UserLocale = z.infer<typeof userLocaleSchema>;

export const dateTimeFormatSchema = z.enum(["system", "24h", "12h"]);
export type DateTimeFormat = z.infer<typeof dateTimeFormatSchema>;

export const temperatureUnitSchema = z.enum(["c", "f"]);
export type TemperatureUnit = z.infer<typeof temperatureUnitSchema>;

export const themeModeSchema = z.enum(["dark", "light", "auto"]);
export type ThemeMode = z.infer<typeof themeModeSchema>;

const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{6})$/, "Invalid hex color (expected #RRGGBB)");

export const notificationSettingsSchema = z
  .object({
    channels: z
      .object({
        email: z.boolean().optional(),
        inApp: z.boolean().optional(),
        webhook: z.boolean().optional(),
        gotify: z.boolean().optional(),
      })
      .optional(),
    categories: z
      .object({
        peakMaturity: z.boolean().optional(),
        climate: z.boolean().optional(),
        plannedConsumption: z.boolean().optional(),
        sharing: z.boolean().optional(),
      })
      .optional(),
    quietHours: z
      .object({
        enabled: z.boolean().optional(),
        start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      })
      .optional(),
    locale: userLocaleSchema.optional(),
    webhookUrl: z.string().url().optional().or(z.literal("")),
    gotifyUrl: z.string().url().optional().or(z.literal("")),
  })
  .strict();

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const profileSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  displayName: z.string().max(80).nullable(),
  avatarUrl: z.string().nullable(),
  tagline: z.string().max(140).nullable(),
  preferredLocale: userLocaleSchema.nullable(),
  dateTimeFormat: dateTimeFormatSchema,
  temperatureUnit: temperatureUnitSchema,
  themeMode: themeModeSchema,
  accentColor: hexColorSchema,
  notificationSettings: z.record(z.unknown()),
  aiApiKey: z.string().nullable().optional(),
});

export type Profile = z.infer<typeof profileSchema>;

export const updateProfileSchema = z
  .object({
    displayName: z.string().max(80).nullable().optional(),
    avatarUrl: z.string().nullable().optional(),
    tagline: z.string().max(140).nullable().optional(),
    preferredLocale: userLocaleSchema.nullable().optional(),
    dateTimeFormat: dateTimeFormatSchema.optional(),
    temperatureUnit: temperatureUnitSchema.optional(),
    themeMode: themeModeSchema.optional(),
    accentColor: hexColorSchema.optional(),
    notificationSettings: notificationSettingsSchema.optional(),
    aiApiKey: z.string().nullable().optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const appSettingsSchema = z.object({
  appName: z.string().max(80).nullable(),
  appTagline: z.string().max(140).nullable(),
  logoUrl: z.string().nullable(),
  smtpHost: z.string().nullable().optional(),
  smtpPort: z.number().int().positive().nullable().optional(),
  smtpUser: z.string().nullable().optional(),
  smtpPass: z.string().nullable().optional(),
  smtpFrom: z.string().nullable().optional(),
  smtpSecure: z.boolean().nullable().optional(),
  updatedAt: z.date(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const updateAppSettingsSchema = z
  .object({
    appName: z.string().max(80).nullable().optional(),
    appTagline: z.string().max(140).nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    smtpHost: z.string().nullable().optional(),
    smtpPort: z.number().int().positive().nullable().optional(),
    smtpUser: z.string().nullable().optional(),
    smtpPass: z.string().nullable().optional(),
    smtpFrom: z.string().nullable().optional(),
    smtpSecure: z.boolean().nullable().optional(),
  })
  .strict();

export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsSchema>;

export const updateUserRoleSchema = z.object({
  role: userRoleSchema,
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

export const updateUserSchema = z.object({
  role: userRoleSchema.optional(),
  displayName: z.string().max(80).nullable().optional(),
  email: z.string().email().optional(),
  username: z.string().max(50).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
