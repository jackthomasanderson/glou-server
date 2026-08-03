import { client } from '../api';
import { ConsumptionSuggestion, ConsumptionGoal, GoalProgress, SetGoalInput } from './types';

export const consumptionPlanClient = {
  async suggestions(limit = 7): Promise<ConsumptionSuggestion[]> {
    const { data } = await client.get<ConsumptionSuggestion[]>(`/consumption-plan/suggestions?limit=${limit}`);
    return data;
  },

  async postpone(id: string, days = 7): Promise<void> {
    await client.patch(`/consumption-plan/items/${id}/postpone`, { days });
  },

  async getGoalProgress(): Promise<GoalProgress> {
    const { data } = await client.get<GoalProgress>('/consumption-plan/goal');
    return data;
  },

  async setGoal(input: SetGoalInput): Promise<ConsumptionGoal> {
    const { data } = await client.put<ConsumptionGoal>('/consumption-plan/goal', input);
    return data;
  },
};
