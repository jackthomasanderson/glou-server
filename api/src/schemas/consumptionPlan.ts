import { z } from "zod";

export const consumptionObjectiveSchema = z.object({
  period: z.enum(["week", "month"]),
  targetCount: z.number().int().min(1),
  prioritizeOpened: z.boolean().optional(),
});

export type ConsumptionObjective = z.infer<typeof consumptionObjectiveSchema>;

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
