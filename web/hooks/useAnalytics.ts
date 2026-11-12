'use client';
import { useQuery } from '@tanstack/react-query';
import { analyticsClient } from '@/lib/analytics/client';
import { AnalyticsStats } from '@/lib/analytics/types';
import { qk } from '@/lib/queryKeys';

export function useAnalytics(from?: string, to?: string) {
  return useQuery<AnalyticsStats>({
    queryKey: qk.analytics.range(from, to),
    queryFn: () => analyticsClient.get(from, to),
    staleTime: 1000 * 60,
  });
}
