'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alertsClient } from '@/lib/alerts/client';

const ALERTS_KEY = ['alerts'];

export function useAlerts() {
  return useQuery({
    queryKey: ALERTS_KEY,
    queryFn: alertsClient.list,
    staleTime: 1000 * 60,
  });
}

export function useToggleAlertPause() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: alertsClient.togglePause,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ALERTS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['bottles'] });
    },
  });
}
