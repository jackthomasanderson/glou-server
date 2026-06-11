'use client';
import { useQuery } from '@tanstack/react-query';
import { analyticsClient } from '@/lib/analytics/client';
import { AnalyticsStats } from '@/lib/analytics/types';

export const ANALYTICS_KEY = ['analytics'];

export function useAnalytics(from?: string, to?: string) {
  return useQuery<AnalyticsStats>({
    queryKey: [...ANALYTICS_KEY, from, to],
    queryFn: () => analyticsClient.get(from, to),
    staleTime: 1000 * 60,
  });
}
