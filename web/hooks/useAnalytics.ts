'use client';
import { useQuery } from '@tanstack/react-query';
import { analyticsClient } from '@/lib/analytics/client';
import { AnalyticsStats } from '@/lib/analytics/types';

export const ANALYTICS_KEY = ['analytics'];

export function useAnalytics() {
  return useQuery<AnalyticsStats>({
    queryKey: ANALYTICS_KEY,
    queryFn: analyticsClient.get,
    staleTime: 1000 * 60,
  });
}
