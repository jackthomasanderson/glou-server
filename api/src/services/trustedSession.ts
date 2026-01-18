import { PrismaClient, trusted_sessions } from "@prisma/client";
import crypto from "crypto";
import { addDays, isPast } from "date-fns";

const prisma = new PrismaClient();

export class TrustedSessionService {
    /**
     * Create a new trusted session
     */
    async createSession(
        userId: string,
        userAgent: string | null,
        ipAddress: string | null,
        rememberMe: boolean = false
    ): Promise<{ rawToken: string; session: trusted_sessions }> {
        // Generate a random token
        const rawToken = crypto.randomBytes(40).toString("hex");

        // Hash the token for storage
        const tokenHash = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

        // Set expiration
        // Default 1 day (standard session), 30 days if rememberMe
        const expiresInDays = rememberMe ? 30 : 1;
        const expiresAt = addDays(new Date(), expiresInDays);

        const session = await prisma.trusted_sessions.create({
            data: {
                user_id: userId,
                refresh_token: tokenHash,
                user_agent: userAgent,
                ip_address: ipAddress,
                expires_at: expiresAt,
            },
        });

        return { rawToken, session };
    }

    /**
     * Verify a refresh token and return the associated session
     */
    async verifySession(rawToken: string): Promise<trusted_sessions | null> {
        const tokenHash = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

        const session = await prisma.trusted_sessions.findUnique({
            where: {
                refresh_token: tokenHash,
            },
        });

        if (!session) {
            return null;
        }

        // Check revocation and expiration
        if (session.is_revoked) {
            return null;
        }

        if (isPast(session.expires_at)) {
            return null;
        }

        // Update last used at
        await prisma.trusted_sessions.update({
            where: { id: session.id },
            data: { last_used_at: new Date() },
        });

        return session;
    }

    /**
     * Revoke a specific session
     */
    async revokeSession(sessionId: string): Promise<void> {
        await prisma.trusted_sessions.update({
            where: { id: sessionId },
            data: { is_revoked: true },
        });
    }

    /**
     * Revoke all other sessions for a user
     */
    async revokeAllUserSessionsExcept(userId: string, currentSessionId: string): Promise<void> {
        await prisma.trusted_sessions.updateMany({
            where: {
                user_id: userId,
                id: { not: currentSessionId },
                is_revoked: false,
            },
            data: { is_revoked: true },
        });
    }

    /**
     * Rotate a session (revoke old, create new)
     * Used during refresh token rotation
     */
    async rotateSession(
        oldSession: trusted_sessions,
        userAgent: string | null,
        ipAddress: string | null
    ): Promise<{ rawToken: string; session: trusted_sessions }> {
        // Revoke old session
        await this.revokeSession(oldSession.id);

        // Calculate remaining duration or reset?
        // Usually reset duration for active users, or keep original if strict.
        // Let's reset to same duration as original logic (based on difference?)
        // For simplicity, let's assume if it was long-lived, it stays long-lived?
        // We don't track "rememberMe" bool in DB, but we can infer from expiration?
        // Let's just default to logic in createSession. Ideally we should pass 'rememberMe' status.
        // For now, let's look at the remaining time. If > 2 days, likely remember me.

        const now = new Date();
        const isLongLived = oldSession.expires_at.getTime() - now.getTime() > 24 * 60 * 60 * 1000 * 2; // > 2 days

        return this.createSession(oldSession.user_id, userAgent, ipAddress, isLongLived);
    }
}
