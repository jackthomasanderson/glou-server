import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "./fetchWithAuth";

// ========== Types ==========

export interface ConsumptionSuggestion {
    bottleId: string;
    bottle: any; // Full bottle object
    score: number;
    reasons: string[];
    priority: "high" | "medium" | "low";
}

export interface ConsumptionObjective {
    id?: string;
    period: "week" | "month";
    targetCount: number;
    prioritizeOpened?: boolean;
    prioritizeCollections?: string[];
    maxBudgetPerBottle?: number;
    active?: boolean;
}

export interface WeeklyPlan {
    weekStart: string;
    weekEnd: string;
    targetCount: number;
    currentProgress: number;
    suggestions: Array<ConsumptionSuggestion & { plannedDay?: number }>;
}

export interface ConsumptionEvent {
    id: string;
    bottleId: string;
    eventType: string;
    eventDate: string;
    notes?: string;
    bottles: {
        id: string;
        label: string;
        category: string;
        vintageOrNone: string;
        photoUrl?: string;
    };
}

// ========== Query Hooks ==========

/**
 * Get consumption suggestions
 */
export function useConsumptionSuggestions(options?: {
    limit?: number;
    collection?: string;
    maxBudget?: number;
}) {
    return useQuery({
        queryKey: ["consumption-suggestions", options],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (options?.limit) params.append("limit", options.limit.toString());
            if (options?.collection) params.append("collection", options.collection);
            if (options?.maxBudget) params.append("maxBudget", options.maxBudget.toString());

            const res = await fetchWithAuth(
                `/api/consumption-plan/suggestions?${params.toString()}`
            );
            if (!res.ok) throw new Error("Failed to fetch suggestions");
            const data = await res.json();
            return data.data as ConsumptionSuggestion[];
        },
    });
}

/**
 * Get active consumption objective
 */
export function useActiveObjective() {
    return useQuery({
        queryKey: ["consumption-objective"],
        queryFn: async () => {
            const res = await fetchWithAuth("/api/consumption-plan/objectives");
            if (!res.ok) throw new Error("Failed to fetch objective");
            const data = await res.json();
            return data.data as ConsumptionObjective | null;
        },
    });
}

/**
 * Get weekly consumption plan
 */
export function useWeeklyPlan() {
    return useQuery({
        queryKey: ["consumption-weekly-plan"],
        queryFn: async () => {
            const res = await fetchWithAuth("/api/consumption-plan/weekly");
            if (!res.ok) throw new Error("Failed to fetch weekly plan");
            const data = await res.json();
            return data.data as WeeklyPlan;
        },
    });
}

/**
 * Get consumption history
 */
export function useConsumptionHistory(options?: {
    limit?: number;
    startDate?: string;
    endDate?: string;
}) {
    return useQuery({
        queryKey: ["consumption-history", options],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (options?.limit) params.append("limit", options.limit.toString());
            if (options?.startDate) params.append("startDate", options.startDate);
            if (options?.endDate) params.append("endDate", options.endDate);

            const res = await fetchWithAuth(
                `/api/consumption-plan/history?${params.toString()}`
            );
            if (!res.ok) throw new Error("Failed to fetch history");
            const data = await res.json();
            return data.data as ConsumptionEvent[];
        },
    });
}

// ========== Mutation Hooks ==========

/**
 * Create a new consumption objective
 */
export function useCreateObjective() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: Omit<ConsumptionObjective, "id">) => {
            const res = await fetchWithAuth("/api/consumption-plan/objectives", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Failed to create objective");
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["consumption-objective"] });
            queryClient.invalidateQueries({ queryKey: ["consumption-suggestions"] });
            queryClient.invalidateQueries({ queryKey: ["consumption-weekly-plan"] });
        },
    });
}

/**
 * Update an existing objective
 */
export function useUpdateObjective() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            id,
            ...data
        }: Partial<ConsumptionObjective> & { id: string }) => {
            const res = await fetchWithAuth(`/api/consumption-plan/objectives/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Failed to update objective");
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["consumption-objective"] });
            queryClient.invalidateQueries({ queryKey: ["consumption-suggestions"] });
            queryClient.invalidateQueries({ queryKey: ["consumption-weekly-plan"] });
        },
    });
}

/**
 * Delete an objective
 */
export function useDeleteObjective() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await fetchWithAuth(`/api/consumption-plan/objectives/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete objective");
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["consumption-objective"] });
            queryClient.invalidateQueries({ queryKey: ["consumption-suggestions"] });
            queryClient.invalidateQueries({ queryKey: ["consumption-weekly-plan"] });
        },
    });
}

/**
 * Mark a bottle as consumed
 */
export function useMarkConsumed() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            bottleId: string;
            notes?: string;
            eventDate?: string;
        }) => {
            const res = await fetchWithAuth("/api/consumption-plan/consume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Failed to mark as consumed");
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["consumption-suggestions"] });
            queryClient.invalidateQueries({ queryKey: ["consumption-weekly-plan"] });
            queryClient.invalidateQueries({ queryKey: ["consumption-history"] });
            queryClient.invalidateQueries({ queryKey: ["bottles"] });
        },
    });
}

/**
 * Skip/postpone a bottle
 */
export function useSkipBottle() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: { bottleId: string; reason?: string }) => {
            const res = await fetchWithAuth("/api/consumption-plan/skip", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error("Failed to skip bottle");
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["consumption-suggestions"] });
            queryClient.invalidateQueries({ queryKey: ["consumption-weekly-plan"] });
        },
    });
}
