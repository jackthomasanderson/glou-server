'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { consumptionPlanClient } from '@/lib/consumption-plan/client';
import { ConsumptionSuggestion, ConsumptionGoal, GoalProgress, SetGoalInput } from '@/lib/consumption-plan/types';

const SUGGESTIONS_KEY = ['consumption-plan', 'suggestions'];
const GOAL_KEY = ['consumption-plan', 'goal'];

// ─── Suggestions ─────────────────────────────────────────────────────────────

export function useConsumptionSuggestions(limit = 7) {
  return useQuery<ConsumptionSuggestion[]>({
    queryKey: [...SUGGESTIONS_KEY, limit],
    queryFn: () => consumptionPlanClient.suggestions(limit),
    staleTime: 1000 * 30,
  });
}

interface PostponeContext {
  previous?: ConsumptionSuggestion[];
}

export function usePostponeSuggestion(limit = 7) {
  const queryClient = useQueryClient();
  const key = [...SUGGESTIONS_KEY, limit];

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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

// ─── Goal ────────────────────────────────────────────────────────────────────

export function useGoalProgress() {
  return useQuery<GoalProgress>({
    queryKey: GOAL_KEY,
    queryFn: consumptionPlanClient.getGoalProgress,
    staleTime: 1000 * 60,
  });
}

export function useSetGoal() {
  const queryClient = useQueryClient();
  return useMutation<ConsumptionGoal, Error, SetGoalInput>({
    mutationFn: consumptionPlanClient.setGoal,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: GOAL_KEY }),
  });
}
