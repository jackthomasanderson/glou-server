import { BottleService } from "./bottles.js";
import { ConsumptionRepository } from "../repositories/consumption.repository.js";
import { logger } from "../utils/logger.js";
import type { Bottle } from "../schemas/bottles.js";

export interface ConsumptionSuggestion {
    bottleId: string;
    bottle: Bottle;
    score: number;
    reasons: string[];
    priority: "high" | "medium" | "low";
}

export interface WeeklyPlan {
    weekStart: string;
    weekEnd: string;
    targetCount: number;
    currentProgress: number;
    suggestions: Array<ConsumptionSuggestion & { plannedDay?: number }>;
}

/**
 * Service for intelligent consumption planning and stock rotation
 */
export class ConsumptionPlanService {
    private bottleService: BottleService;
    private repo: ConsumptionRepository;

    constructor() {
        this.bottleService = new BottleService();
        this.repo = new ConsumptionRepository();
    }

    /**
     * Generate prioritized consumption suggestions with enhanced scoring
     */
    async generateSuggestions(
        userId: string,
        options?: {
            limit?: number;
            filterByCollection?: string;
            maxBudget?: number;
        }
    ): Promise<ConsumptionSuggestion[]> {
        // Get all user bottles
        let bottles = await this.bottleService.getBottlesByUserId(userId);

        // Get active objective
        const objective = await this.repo.getActiveObjective(userId);

        // Get recently consumed bottles to exclude
        const since = new Date();
        since.setMonth(since.getMonth() - 1);
        const consumedIds = await this.repo.getConsumedBottleIds(userId, since);

        // Filter out consumed bottles
        bottles = bottles.filter((b) => !consumedIds.includes(b.id));

        // Apply filters
        if (options?.filterByCollection) {
            bottles = bottles.filter(
                (b) => b.collection === options.filterByCollection
            );
        }
        if (options?.maxBudget) {
            bottles = bottles.filter(
                (b) =>
                    !b.purchasePrice || Number(b.purchasePrice) <= (options.maxBudget || 0)
            );
        }

        const now = new Date();
        const currentYear = now.getFullYear();

        // Score each bottle
        const suggestions: ConsumptionSuggestion[] = bottles.map((bottle) => {
            let score = 0;
            const reasons: string[] = [];

            // === PEAK MATURITY SCORING (FEAT-06) ===
            if (bottle.peakMaturityFrom && bottle.peakMaturityTo) {
                if (
                    bottle.peakMaturityFrom <= currentYear &&
                    currentYear <= bottle.peakMaturityTo
                ) {
                    score += 50;
                    reasons.push("consumption.suggestion.peakMaturity");

                    // Bonus for being in the middle of the window
                    const windowSize = bottle.peakMaturityTo - bottle.peakMaturityFrom;
                    const progress = currentYear - bottle.peakMaturityFrom;
                    if (windowSize > 0 && progress / windowSize >= 0.4 && progress / windowSize <= 0.6) {
                        score += 10;
                    }
                } else if (currentYear > bottle.peakMaturityTo) {
                    // Past maturity - urgent drinking
                    const yearsPast = currentYear - bottle.peakMaturityTo;
                    score += 40 + Math.min(yearsPast * 5, 30);
                    reasons.push("consumption.suggestion.pastMaturity");
                } else if (currentYear === bottle.peakMaturityFrom - 1) {
                    // Approaching optimal window
                    score += 20;
                    reasons.push("consumption.suggestion.approaching");
                }
            }

            // === OPENED BOTTLE PRIORITY (FEAT-07) ===
            if (bottle.isOpened) {
                score += 30;
                reasons.push("consumption.suggestion.opened");

                // Extra urgency for low fill levels
                if (bottle.fillLevel) {
                    if (["low", "empty"].includes(bottle.fillLevel)) {
                        score += 15;
                        reasons.push("consumption.suggestion.lowLevel");
                    } else if (bottle.fillLevel === "half") {
                        score += 5;
                    }
                }
            }

            // === BUDGET-BASED DAILY DRINKING ===
            if (bottle.purchasePrice !== undefined) {
                const price = Number(bottle.purchasePrice);
                if (price < 20) {
                    score += 10;
                    reasons.push("consumption.suggestion.budget");
                } else if (price > 100) {
                    // Expensive bottles - lower priority unless other factors
                    score -= 10;
                }
            }

            // === STOCK ROTATION ===
            if (bottle.createdAt) {
                const ageInMonths =
                    (now.getTime() - new Date(bottle.createdAt).getTime()) /
                    (1000 * 60 * 60 * 24 * 30);
                if (ageInMonths > 12) {
                    score += 10;
                    reasons.push("consumption.reasons.rotation");
                }
            }

            // === OBJECTIVE-BASED SCORING ===
            if (objective) {
                // Prioritize opened if objective says so
                if (objective.prioritize_opened && bottle.isOpened) {
                    score += 15;
                }

                // Prioritize specific collections
                if (
                    objective.prioritize_collections &&
                    objective.prioritize_collections.length > 0 &&
                    bottle.collection &&
                    objective.prioritize_collections.includes(bottle.collection)
                ) {
                    score += 15;
                    reasons.push("consumption.reasons.collection");
                }

                // Budget constraints
                if (objective.max_budget_per_bottle && bottle.purchasePrice) {
                    const price = Number(bottle.purchasePrice);
                    if (price <= Number(objective.max_budget_per_bottle)) {
                        score += 10;
                    } else {
                        score -= 20; // Penalize over-budget bottles
                    }
                }
            }

            // Determine priority based on total score
            let priority: "high" | "medium" | "low" = "low";
            if (score >= 60) priority = "high";
            else if (score >= 30) priority = "medium";

            return {
                bottleId: bottle.id,
                bottle,
                score,
                reasons,
                priority,
            };
        });

        // Sort by score descending
        suggestions.sort((a, b) => b.score - a.score);

        // Apply limit
        const limit = options?.limit ?? 20;
        return suggestions.slice(0, limit);
    }

    /**
     * Generate a weekly consumption plan
     */
    async generateWeeklyPlan(userId: string): Promise<WeeklyPlan> {
        const objective = await this.repo.getActiveObjective(userId);

        // Default to 3 bottles per week if no objective
        let targetCount = 3;
        if (objective && objective.period === "week") {
            targetCount = objective.target_count;
        } else if (objective && objective.period === "month") {
            targetCount = Math.ceil(objective.target_count / 4);
        }

        // Get top suggestions
        const suggestions = await this.generateSuggestions(userId, {
            limit: targetCount + 5, // Get a few extra for flexibility
        });

        // Calculate week bounds
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay()); // Start on Sunday
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        // Distribute suggestions across the week
        const plannedSuggestions = suggestions.slice(0, targetCount).map((s, idx) => ({
            ...s,
            plannedDay: Math.floor((idx / targetCount) * 7), // Distribute evenly
        }));

        // Get current progress (bottles consumed this week)
        const weeklyEvents = await this.repo.getEvents(userId, {
            eventType: "consumed",
            startDate: weekStart,
            endDate: weekEnd,
        });

        return {
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            targetCount,
            currentProgress: weeklyEvents.length,
            suggestions: plannedSuggestions,
        };
    }

    /**
     * Mark a bottle as consumed
     */
    async markBottleConsumed(
        userId: string,
        bottleId: string,
        notes?: string,
        eventDate?: Date
    ): Promise<void> {
        await this.repo.createEvent({
            userId,
            bottleId,
            eventType: "consumed",
            eventDate: eventDate || new Date(),
            notes,
        });

        logger.info({ userId, bottleId }, "Bottle marked as consumed");
    }

    /**
     * Skip/postpone a bottle in the rotation
     */
    async skipBottle(
        userId: string,
        bottleId: string,
        reason?: string
    ): Promise<void> {
        await this.repo.createEvent({
            userId,
            bottleId,
            eventType: "postponed",
            eventDate: new Date(),
            notes: reason,
        });

        logger.info({ userId, bottleId }, "Bottle postponed");
    }

    /**
     * Get consumption history
     */
    async getConsumptionHistory(
        userId: string,
        options?: {
            limit?: number;
            startDate?: Date;
            endDate?: Date;
        }
    ) {
        return this.repo.getEvents(userId, {
            eventType: "consumed",
            ...options,
        });
    }

    /**
     * Get active consumption objective
     */
    async getActiveObjective(userId: string) {
        return this.repo.getActiveObjective(userId);
    }

    /**
     * Create a new consumption objective
     */
    async createObjective(
        userId: string,
        data: {
            period: string;
            targetCount: number;
            prioritizeOpened?: boolean;
            prioritizeCollections?: string[];
            maxBudgetPerBottle?: number;
        }
    ) {
        return this.repo.createObjective({
            userId,
            ...data,
        });
    }

    /**
     * Update an existing objective
     */
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
        return this.repo.updateObjective(objectiveId, userId, data);
    }

    /**
     * Delete (deactivate) an objective
     */
    async deleteObjective(objectiveId: string, userId: string) {
        return this.repo.deleteObjective(objectiveId, userId);
    }
}
