import { prisma } from "../lib/prisma.js";
import type { bottles, Prisma } from "@prisma/client";

/**
 * Bottle Repository
 * Encapsulates all database operations related to bottles
 */
export class BottleRepository {
    /**
   * Create a new bottle
   */
    async createBottle(userId: string, cellarId: string, data: Prisma.bottlesCreateInput): Promise<bottles> {
        return await prisma.bottles.create({
            data: {
                ...data,
                users: {
                    connect: { id: userId },
                },
            },
        });
    }

    /**
     * Get bottle by ID (with ownership check)
     */
    async getBottleById(id: string, userId: string): Promise<bottles | null> {
        return await prisma.bottles.findFirst({
            where: {
                id,
                user_id: userId,
            },
        });
    }

    /**
     * List all bottles for a user
     */
    async getBottlesByUserId(userId: string): Promise<bottles[]> {
        return await prisma.bottles.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
        });
    }

    /**
     * List bottles in a specific cellar
     */
    async getBottlesByCellarId(cellarId: string, userId: string): Promise<bottles[]> {
        return await prisma.bottles.findMany({
            where: {
                cellar_id: cellarId,
                user_id: userId,
            },
            orderBy: { created_at: "desc" },
        });
    }

    /**
     * Update bottle
     */
    async updateBottle(id: string, userId: string, data: Prisma.bottlesUpdateInput): Promise<bottles> {
        // First check ownership
        const bottle = await this.getBottleById(id, userId);
        if (!bottle) {
            throw new Error("Bottle not found or access denied");
        }

        return await prisma.bottles.update({
            where: { id },
            data,
        });
    }

    /**
     * Delete bottle
     */
    async deleteBottle(id: string, userId: string): Promise<boolean> {
        // First check ownership
        const bottle = await this.getBottleById(id, userId);
        if (!bottle) {
            return false;
        }

        await prisma.bottles.delete({
            where: { id },
        });

        return true;
    }

    /**
     * Count bottles by user
     */
    async countBottlesByUserId(userId: string): Promise<number> {
        return await prisma.bottles.count({
            where: { user_id: userId },
        });
    }

    /**
     * Count bottles by cellar
     */
    async countBottlesByCellarId(cellarId: string): Promise<number> {
        return await prisma.bottles.count({
            where: { cellar_id: cellarId },
        });
    }
}
