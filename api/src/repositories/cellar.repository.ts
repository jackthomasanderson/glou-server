import { prisma } from "../lib/prisma.js";
import type { cellars, Prisma } from "@prisma/client";

/**
 * Cellar Repository
 * Encapsulates all database operations related to cellars
 */
export class CellarRepository {
    /**
     * Create a new cellar
     */
    async createCellar(userId: string, data: Prisma.cellarsCreateInput): Promise<cellars> {
        return await prisma.cellars.create({
            data,
        });
    }

    /**
     * Get cellar by ID (with ownership check)
     */
    async getCellarById(id: string, userId: string): Promise<cellars | null> {
        return await prisma.cellars.findFirst({
            where: {
                id,
                user_id: userId,
            },
        });
    }

    /**
     * Get cellar with bottle count
     */
    async getCellarWithStats(id: string, userId: string) {
        const cellar = await prisma.cellars.findFirst({
            where: {
                id,
                user_id: userId,
            },
        });

        if (!cellar) return null;

        // Calculate bottle count (sum of quantities)
        // We fetch id and quantity to sum in application to handle COALESCE logic
        // or use aggregate if we trust data. The SQL used COALESCE(quantity, 1).
        // Best approach with Prisma: fetch quantities.
        const bottles = await prisma.bottles.findMany({
            where: {
                cellar_id: id,
                user_id: userId,
            },
            select: {
                category: true,
                quantity_in_box: true,
            },
        });

        let bottleCount = 0;
        let cigarCount = 0;

        for (const b of bottles) {
            const qty = b.quantity_in_box ?? 1;
            if (b.category === "cigar") {
                cigarCount += qty;
            } else {
                bottleCount += qty;
            }
        }

        return {
            ...cellar,
            bottleCount,
            cigarCount,
        };
    }

    /**
     * List all cellars for a user with bottle counts
     */
    async getCellarsByUserId(userId: string) {
        const cellars = await prisma.cellars.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
        });

        const cellarsWithCounts = await Promise.all(
            cellars.map(async (cellar) => {
                // Fetch bottles for stats
                const bottles = await prisma.bottles.findMany({
                    where: {
                        cellar_id: cellar.id,
                    },
                    select: {
                        category: true,
                        quantity_in_box: true,
                    },
                });

                let bottleCount = 0;
                let cigarCount = 0;

                for (const b of bottles) {
                    const qty = b.quantity_in_box ?? 1;
                    if (b.category === "cigar") {
                        cigarCount += qty;
                    } else {
                        bottleCount += qty;
                    }
                }

                return {
                    ...cellar,
                    bottleCount,
                    cigarCount,
                };
            })
        );

        return cellarsWithCounts;
    }

    /**
     * Update cellar
     */
    async updateCellar(id: string, userId: string, data: Prisma.cellarsUpdateInput): Promise<cellars> {
        // First check ownership
        const cellar = await this.getCellarById(id, userId);
        if (!cellar) {
            throw new Error("Cellar not found or access denied");
        }

        return await prisma.cellars.update({
            where: { id },
            data,
        });
    }

    /**
     * Delete cellar (cascade delete bottles)
     */
    async deleteCellar(id: string, userId: string): Promise<boolean> {
        // First check ownership
        const cellar = await this.getCellarById(id, userId);
        if (!cellar) {
            return false;
        }

        await prisma.cellars.delete({
            where: { id },
        });

        return true;
    }
}
