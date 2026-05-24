'use client';
import { useQuery } from '@tanstack/react-query';
import { client } from '@/lib/api';

export function useConnectivity(): boolean | null {
  const { data } = useQuery({
    queryKey: ['connectivity'],
    queryFn: () => client.get<{ online: boolean }>('/connectivity').then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
  });
  return data?.online ?? null;
}
