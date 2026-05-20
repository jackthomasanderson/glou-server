import { client } from '../api';

export interface AlertBottle {
  id: string;
  name: string;
  producer: string;
  category: string;
  vintage?: number | null;
  peakMaturityFrom?: number | null;
  peakMaturityTo?: number | null;
  alertStatus?: string | null;
  alertsPaused?: boolean;
  cellarId?: string | null;
  collection?: string | null;
  photoUrl?: string | null;
}

export const alertsClient = {
  async list(): Promise<AlertBottle[]> {
    const { data } = await client.get<AlertBottle[]>('/alerts');
    return data;
  },

  async togglePause(id: string): Promise<void> {
    await client.patch(`/alerts/${id}/pause`);
  },
};
