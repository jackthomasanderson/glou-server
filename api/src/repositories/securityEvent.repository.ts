import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

/**
 * Security Event Repository
 * Encapsulates all database operations related to security events
 */
export class SecurityEventRepository {
    /**
     * Create a security event
     */
    async createEvent(data: Prisma.security_eventsCreateInput): Promise<void> {
        await prisma.security_events.create({
            data,
        });
    }

    /**
     * Get recent events for a user
     */
    async getRecentEvents(userId: string, limit: number = 20) {
        return await prisma.security_events.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
            take: limit,
            select: {
                id: true,
                user_id: true,
                event_type: true,
                ip_address: true,
                user_agent: true,
                metadata: true,
                created_at: true,
            },
        });
    }
}
