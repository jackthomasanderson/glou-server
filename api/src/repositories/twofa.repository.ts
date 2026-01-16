import { prisma } from "../lib/prisma.js";
import type { two_fa_settings, Prisma } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

/**
 * TwoFA Repository
 * Encapsulates all database operations related to 2FA settings
 */
export class TwoFARepository {
    /**
     * Get 2FA settings for a user
     */
    async getTwoFASettings(userId: string): Promise<two_fa_settings | null> {
        return await prisma.two_fa_settings.findUnique({
            where: { user_id: userId },
        });
    }

    /**
     * Create 2FA settings
     */
    async createTwoFASettings(data: Prisma.two_fa_settingsCreateInput): Promise<two_fa_settings> {
        return await prisma.two_fa_settings.create({
            data,
        });
    }

    /**
     * Update 2FA settings
     */
    async updateTwoFASettings(userId: string, data: Prisma.two_fa_settingsUpdateInput): Promise<two_fa_settings> {
        return await prisma.two_fa_settings.update({
            where: { user_id: userId },
            data,
        });
    }

    /**
     * Delete 2FA settings (disable 2FA)
     */
    async deleteTwoFASettings(userId: string): Promise<two_fa_settings> {
        return await prisma.two_fa_settings.delete({
            where: { user_id: userId },
        });
    }

    /**
     * Enable 2FA
     */
    async enableTwoFA(userId: string, totpSecret: string, recoveryCodesHash: string[]): Promise<two_fa_settings> {
        const existing = await this.getTwoFASettings(userId);

        if (existing) {
            return await this.updateTwoFASettings(userId, {
                method: "totp",
                totp_secret: totpSecret,
                recovery_codes_hash: recoveryCodesHash,
                enabled_at: new Date(),
            });
        } else {
            return await this.createTwoFASettings({
                id: uuidv4(),
                users: {
                    connect: { id: userId },
                },
                method: "totp",
                totp_secret: totpSecret,
                recovery_codes_hash: recoveryCodesHash,
                enabled_at: new Date(),
            });
        }
    }

    /**
     * Disable 2FA
     */
    async disableTwoFA(userId: string): Promise<void> {
        const existing = await this.getTwoFASettings(userId);
        if (existing) {
            await this.deleteTwoFASettings(userId);
        }
    }
}
