'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alertsClient } from '@/lib/alerts/client';
import { qk } from '@/lib/queryKeys';

export function useAlerts() {
  return useQuery({
    queryKey: qk.alerts,
    queryFn: alertsClient.list,
    staleTime: 1000 * 60,
  });
}

export function useToggleAlertPause() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: alertsClient.togglePause,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.alerts });
      // The inventory list and the open drawer carry `alertsPaused` too; the bell's count follows.
      void queryClient.invalidateQueries({ queryKey: qk.inventory.all });
      void queryClient.invalidateQueries({ queryKey: qk.sidebarCounts });
    },
  });
}
