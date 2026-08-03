import { client } from '../api';
import { BudgetEnvelope, BudgetEnvelopeInput, BudgetProgress } from './types';

export const budgetClient = {
  async list(): Promise<BudgetEnvelope[]> {
    const { data } = await client.get<BudgetEnvelope[]>('/wishlist/budget-envelopes');
    return data;
  },

  async create(data: BudgetEnvelopeInput): Promise<BudgetEnvelope> {
    const { data: result } = await client.post<BudgetEnvelope>('/wishlist/budget-envelopes', data);
    return result;
  },

  async update(id: string, data: Partial<BudgetEnvelopeInput>): Promise<BudgetEnvelope> {
    const { data: result } = await client.patch<BudgetEnvelope>(`/wishlist/budget-envelopes/${id}`, data);
    return result;
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/wishlist/budget-envelopes/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok && res.status !== 204) throw new Error('DELETE_FAILED');
  },

  async getProgress(id: string): Promise<BudgetProgress> {
    const { data } = await client.get<BudgetProgress>(`/wishlist/budget-envelopes/${id}/progress`);
    return data;
  },
};
