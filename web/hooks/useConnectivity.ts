'use client';
import { useQuery } from '@tanstack/react-query';

export function useConnectivity(): boolean | null {
  const { data } = useQuery({
    queryKey: ['connectivity'],
    queryFn: async () => {
      const res = await fetch('/api/connectivity');
      return res.json() as Promise<{ online: boolean }>;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
  });
  return data?.online ?? null;
}
