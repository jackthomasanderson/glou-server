'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { consumptionPlanClient } from '@/lib/consumption-plan/client';
import { invalidateAfterInventoryChange, qk } from '@/lib/queryKeys';
import { ConsumptionSuggestion, ConsumptionGoal, GoalProgress, SetGoalInput } from '@/lib/consumption-plan/types';

// ─── Suggestions ─────────────────────────────────────────────────────────────

export function useConsumptionSuggestions(limit = 7) {
  return useQuery<ConsumptionSuggestion[]>({
    queryKey: qk.consumptionPlan.suggestions(limit),
    queryFn: () => consumptionPlanClient.suggestions(limit),
    staleTime: 1000 * 30,
  });
}

interface PostponeContext {
  previous?: ConsumptionSuggestion[];
}

export function usePostponeSuggestion(limit = 7) {
  const queryClient = useQueryClient();
  const key = qk.consumptionPlan.suggestions(limit);

  return useMutation<void, Error, string, PostponeContext>({
    mutationFn: (id: string) => consumptionPlanClient.postpone(id),
    // Optimistic UI (ux-ui.md 5.2): the item disappears immediately, and is
    // restored if the mutation fails.
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ConsumptionSuggestion[]>(key);
      queryClient.setQueryData<ConsumptionSuggestion[]>(key, (old) => old?.filter((s) => s.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    // Postponed on the bottle itself: the suggestions, the list and the rest follow.
    onSettled: () => invalidateAfterInventoryChange(queryClient),
  });
}

// ─── Goal ────────────────────────────────────────────────────────────────────

export function useGoalProgress() {
  return useQuery<GoalProgress>({
    queryKey: qk.consumptionPlan.goal,
    queryFn: consumptionPlanClient.getGoalProgress,
    staleTime: 1000 * 60,
  });
}

export function useSetGoal() {
  const queryClient = useQueryClient();
  return useMutation<ConsumptionGoal, Error, SetGoalInput>({
    // Said by the goal form (ConsumptionPlanWidget).
    meta: { handlesError: true },
    mutationFn: consumptionPlanClient.setGoal,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.consumptionPlan.goal }),
  });
}
