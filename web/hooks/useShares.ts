'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sharesClient } from '@/lib/shares/client';
import { notifyError } from '@/lib/toast';
import { minutesToWait } from '@/lib/auth/error-message';
import { TOO_MANY_REQUESTS_ERROR } from '@shared/auth';
import { CreatedGuestShare, GuestShare, ShareFormValues } from '@/lib/shares/types';
import { qk } from '@/lib/queryKeys';

const SHARES_KEY = qk.shares;

export function useShares() {
  return useQuery<GuestShare[]>({
    queryKey: SHARES_KEY,
    queryFn: sharesClient.list,
    staleTime: 1000 * 30,
  });
}

export function useCreateShare() {
  const queryClient = useQueryClient();
  return useMutation<CreatedGuestShare, Error, ShareFormValues>({
    meta: { handlesError: true },
    mutationFn: sharesClient.create,
    onSuccess: (created) => {
      queryClient.setQueryData<GuestShare[]>(SHARES_KEY, (old) =>
        old ? [created, ...old] : [created],
      );
    },
    // #911: a read/write link asks for the password; a wrong one, or a spent
    // password budget, is said as such.
    onError: (err) => {
      if (err.message === TOO_MANY_REQUESTS_ERROR) notifyError('auth.errors.TOO_MANY_REQUESTS', { count: minutesToWait(err) });
      else notifyError(err.message === 'INVALID_CREDENTIALS' ? 'profile.passwordError' : 'toast.share.createError', undefined);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: SHARES_KEY }),
  });
}

export function useRevokeShare() {
  const queryClient = useQueryClient();
  return useMutation<GuestShare, Error, string>({
    meta: { handlesError: true },
    mutationFn: sharesClient.revoke,
    onSuccess: (updated) => {
      queryClient.setQueryData<GuestShare[]>(SHARES_KEY, (old) =>
        old ? old.map((s) => (s.id === updated.id ? updated : s)) : [updated],
      );
    },
    onError: () => notifyError('toast.share.revokeError'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: SHARES_KEY }),
  });
}
