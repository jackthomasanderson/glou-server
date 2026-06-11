import { client } from '../api';
import { AnalyticsStats } from './types';

export const analyticsClient = {
  async get(from?: string, to?: string): Promise<AnalyticsStats> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    const { data } = await client.get<AnalyticsStats>(`/analytics${qs ? `?${qs}` : ''}`);
    return data;
  },
};
