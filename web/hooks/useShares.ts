'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sharesClient } from '@/lib/shares/client';
import { GuestShare, ShareFormValues } from '@/lib/shares/types';

export const SHARES_KEY = ['shares'];

export function useShares() {
  return useQuery<GuestShare[]>({
    queryKey: SHARES_KEY,
    queryFn: sharesClient.list,
    staleTime: 1000 * 30,
  });
}

export function useCreateShare() {
  const queryClient = useQueryClient();
  return useMutation<GuestShare, Error, ShareFormValues>({
    mutationFn: sharesClient.create,
    onSuccess: (created) => {
      queryClient.setQueryData<GuestShare[]>(SHARES_KEY, (old) =>
        old ? [created, ...old] : [created],
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: SHARES_KEY }),
  });
}

export function useRevokeShare() {
  const queryClient = useQueryClient();
  return useMutation<GuestShare, Error, string>({
    mutationFn: sharesClient.revoke,
    onSuccess: (updated) => {
      queryClient.setQueryData<GuestShare[]>(SHARES_KEY, (old) =>
        old ? old.map((s) => (s.id === updated.id ? updated : s)) : [updated],
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: SHARES_KEY }),
  });
}
