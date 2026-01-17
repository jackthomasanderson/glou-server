import { z } from "zod";

export const consumptionObjectiveSchema = z.object({
  period: z.enum(["week", "month"]),
  targetCount: z.number().int().min(1),
  prioritizeOpened: z.boolean().optional(),
  prioritizeCollections: z.array(z.string()).optional(),
  maxBudgetPerBottle: z.number().positive().optional(),
});

export type ConsumptionObjective = z.infer<typeof consumptionObjectiveSchema>;

export const updateConsumptionObjectiveSchema = z.object({
  period: z.enum(["week", "month"]).optional(),
  targetCount: z.number().int().min(1).optional(),
  prioritizeOpened: z.boolean().optional(),
  prioritizeCollections: z.array(z.string()).optional(),
  maxBudgetPerBottle: z.number().positive().optional(),
  active: z.boolean().optional(),
});

export const consumptionPlanSuggestionSchema = z.object({
  bottleId: z.string().uuid(),
  reason: z.string(), // i18n key
  score: z.number(),
  plannedDate: z.string().datetime().optional(),
});

export type ConsumptionPlanSuggestion = z.infer<typeof consumptionPlanSuggestionSchema>;

export const weeklyPlanSchema = z.object({
  weekStart: z.string().datetime(),
  suggestions: z.array(consumptionPlanSuggestionSchema),
});

export type WeeklyPlan = z.infer<typeof weeklyPlanSchema>;

// New schemas for consumption events and actions
export const markConsumedSchema = z.object({
  bottleId: z.string().uuid(),
  notes: z.string().optional(),
  eventDate: z.string().datetime().optional(),
});

export type MarkConsumedInput = z.infer<typeof markConsumedSchema>;

export const skipBottleSchema = z.object({
  bottleId: z.string().uuid(),
  reason: z.string().optional(),
});

export type SkipBottleInput = z.infer<typeof skipBottleSchema>;

export const consumptionHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type ConsumptionHistoryQuery = z.infer<typeof consumptionHistoryQuerySchema>;
