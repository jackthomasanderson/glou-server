import { client } from '../api';
import { AnalyticsStats } from './types';

export const analyticsClient = {
  async get(): Promise<AnalyticsStats> {
    const { data } = await client.get<AnalyticsStats>('/analytics');
    return data;
  },
};
