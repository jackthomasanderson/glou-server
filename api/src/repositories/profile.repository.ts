import { prisma } from "../lib/prisma.js";
import type { users, app_settings, Prisma } from "@prisma/client";

/**
 * Profile Repository
 * Encapsulates all database operations related to user profiles and app settings
 */
export class ProfileRepository {
    /**
     * Get user profile by user ID
     */
    async getProfileByUserId(userId: string): Promise<Omit<users, "password_hash" | "two_factor_secret" | "two_factor_recovery_codes"> | null> {
        return await prisma.users.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                display_name: true,
                avatar_url: true,
                tagline: true,
                preferred_locale: true,
                date_time_format: true,
                temperature_unit: true,
                theme_mode: true,
                accent_color: true,
                notification_settings: true,
                ai_api_key: true,
                created_at: true,
                updated_at: true,
            },
        });
    }

    /**
     * Update user profile
     */
    async updateProfile(userId: string, data: Prisma.usersUpdateInput): Promise<users> {
        return await prisma.users.update({
            where: { id: userId },
            data,
        });
    }

    /**
     * Get global app settings
     */
    async getAppSettings(): Promise<app_settings | null> {
        return await prisma.app_settings.findFirst({
            where: { id: true },
        });
    }

    /**
     * Update app settings
     */
    async updateAppSettings(data: Prisma.app_settingsUpdateInput): Promise<app_settings> {
        // App settings has a single row with id=true
        return await prisma.app_settings.update({
            where: { id: true },
            data,
        });
    }

    /**
     * Set AI API key (global)
     */
    async setAiApiKey(apiKey: string): Promise<app_settings> {
        return await this.updateAppSettings({
            ai_api_key: apiKey,
        });
    }

    /**
     * List all users (admin only)
     */
    async listUsers(): Promise<Partial<users>[]> {
        return await prisma.users.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                display_name: true,
                avatar_url: true,
                created_at: true,
                updated_at: true,
            },
            orderBy: { created_at: "desc" },
        });
    }

    /**
     * Update user role (admin only)
     */
    async updateUserRole(userId: string, role: string): Promise<users> {
        return await prisma.users.update({
            where: { id: userId },
            data: { role },
        });
    }

    /**
     * Delete user (admin only)
     */
    async deleteUser(userId: string): Promise<users> {
        return await prisma.users.delete({
            where: { id: userId },
        });
    }
}
