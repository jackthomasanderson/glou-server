'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetClient } from '@/lib/budget/client';
import { BudgetEnvelope, BudgetEnvelopeInput, BudgetProgress } from '@/lib/budget/types';

export const BUDGET_KEY = ['budget', 'envelopes'];
const progressKey = (id: string) => ['budget', 'progress', id];

export function useBudgetEnvelopes() {
  return useQuery<BudgetEnvelope[]>({
    queryKey: BUDGET_KEY,
    queryFn: budgetClient.list,
    staleTime: 1000 * 30,
  });
}

export function useCreateBudgetEnvelope() {
  const queryClient = useQueryClient();
  return useMutation<BudgetEnvelope, Error, BudgetEnvelopeInput>({
    mutationFn: budgetClient.create,
    onSuccess: (created) => {
      queryClient.setQueryData<BudgetEnvelope[]>(BUDGET_KEY, (old) => (old ? [created, ...old] : [created]));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: BUDGET_KEY }),
  });
}

export function useUpdateBudgetEnvelope() {
  const queryClient = useQueryClient();
  return useMutation<BudgetEnvelope, Error, { id: string; data: Partial<BudgetEnvelopeInput> }>({
    mutationFn: ({ id, data }) => budgetClient.update(id, data),
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({ queryKey: BUDGET_KEY });
      if (vars) void queryClient.invalidateQueries({ queryKey: progressKey(vars.id) });
    },
  });
}

export function useDeleteBudgetEnvelope() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: budgetClient.delete,
    onSuccess: (_, id) => {
      queryClient.setQueryData<BudgetEnvelope[]>(BUDGET_KEY, (old) => (old ? old.filter((b) => b.id !== id) : []));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: BUDGET_KEY }),
  });
}

export function useBudgetProgress(id: string | null) {
  return useQuery<BudgetProgress>({
    queryKey: progressKey(id ?? 'none'),
    queryFn: () => budgetClient.getProgress(id as string),
    enabled: !!id,
    staleTime: 1000 * 30,
  });
}
