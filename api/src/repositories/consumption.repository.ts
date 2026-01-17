import { PrismaClient, Prisma } from "@prisma/client";
import { logger } from "../utils/logger.js";

/**
 * Repository for consumption-related database operations
 */
export class ConsumptionRepository {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    // ========== Consumption Objectives ==========

    async getActiveObjective(userId: string) {
        return this.prisma.consumption_objectives.findFirst({
            where: { user_id: userId, active: true },
            orderBy: { created_at: "desc" },
        });
    }

    async getAllObjectives(userId: string) {
        return this.prisma.consumption_objectives.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
        });
    }

    async createObjective(data: {
        userId: string;
        period: string;
        targetCount: number;
        prioritizeOpened?: boolean;
        prioritizeCollections?: string[];
        maxBudgetPerBottle?: number;
    }) {
        // Deactivate existing active objectives
        await this.prisma.consumption_objectives.updateMany({
            where: { user_id: data.userId, active: true },
            data: { active: false },
        });

        return this.prisma.consumption_objectives.create({
            data: {
                user_id: data.userId,
                period: data.period,
                target_count: data.targetCount,
                prioritize_opened: data.prioritizeOpened ?? false,
                prioritize_collections: data.prioritizeCollections ?? [],
                max_budget_per_bottle: data.maxBudgetPerBottle ?? null,
                active: true,
            },
        });
    }

    async updateObjective(
        objectiveId: string,
        userId: string,
        data: {
            period?: string;
            targetCount?: number;
            prioritizeOpened?: boolean;
            prioritizeCollections?: string[];
            maxBudgetPerBottle?: number;
            active?: boolean;
        }
    ) {
        const updateData: any = { updated_at: new Date() };

        if (data.period !== undefined) updateData.period = data.period;
        if (data.targetCount !== undefined) updateData.target_count = data.targetCount;
        if (data.prioritizeOpened !== undefined) updateData.prioritize_opened = data.prioritizeOpened;
        if (data.prioritizeCollections !== undefined) updateData.prioritize_collections = data.prioritizeCollections;
        if (data.maxBudgetPerBottle !== undefined) updateData.max_budget_per_bottle = data.maxBudgetPerBottle;
        if (data.active !== undefined) updateData.active = data.active;

        return this.prisma.consumption_objectives.update({
            where: { id: objectiveId, user_id: userId },
            data: updateData,
        });
    }

    async deleteObjective(objectiveId: string, userId: string) {
        return this.prisma.consumption_objectives.update({
            where: { id: objectiveId, user_id: userId },
            data: { active: false },
        });
    }

    // ========== Consumption Events ==========

    async createEvent(data: {
        userId: string;
        bottleId: string;
        eventType: string;
        eventDate: Date;
        notes?: string;
    }) {
        return this.prisma.consumption_events.create({
            data: {
                user_id: data.userId,
                bottle_id: data.bottleId,
                event_type: data.eventType,
                event_date: data.eventDate,
                notes: data.notes ?? null,
            },
        });
    }

    async getEvents(userId: string, options?: {
        bottleId?: string;
        eventType?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }) {
        const where: any = { user_id: userId };

        if (options?.bottleId) where.bottle_id = options.bottleId;
        if (options?.eventType) where.event_type = options.eventType;
        if (options?.startDate || options?.endDate) {
            where.event_date = {};
            if (options.startDate) where.event_date.gte = options.startDate;
            if (options.endDate) where.event_date.lte = options.endDate;
        }

        return this.prisma.consumption_events.findMany({
            where,
            orderBy: { event_date: "desc" },
            take: options?.limit ?? 100,
            include: {
                bottles: {
                    select: {
                        id: true,
                        label: true,
                        category: true,
                        vintage_or_none: true,
                        photo_url: true,
                    },
                },
            },
        });
    }

    async getConsumedBottleIds(userId: string, since?: Date) {
        const where: any = {
            user_id: userId,
            event_type: "consumed",
        };

        if (since) {
            where.event_date = { gte: since };
        }

        const events = await this.prisma.consumption_events.findMany({
            where,
            select: { bottle_id: true },
        });

        return events.map((e) => e.bottle_id);
    }
}
