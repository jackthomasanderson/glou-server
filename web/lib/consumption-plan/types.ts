export type SuggestionReason = 'peak_window' | 'opened' | 'rotation';

export interface ConsumptionSuggestion {
  id: string;
  name: string;
  producer: string;
  category: string;
  vintage?: number | null;
  photoUrl?: string | null;
  cellarId?: string | null;
  collection?: string | null;
  alertStatus?: string | null;
  isOpened: boolean;
  fillLevel?: number | null;
  reason: SuggestionReason;
}

export type GoalTargetType = 'volume' | 'count';

export interface ConsumptionGoal {
  id: string;
  periodStart: string;
  periodEnd: string;
  targetType: GoalTargetType;
  targetValue: number;
  createdAt: string;
}

export interface GoalProgress {
  goal: ConsumptionGoal | null;
  consumedCount: number;
  percent: number;
  remaining: number;
}

export interface SetGoalInput {
  periodStart: string;
  periodEnd: string;
  targetType: GoalTargetType;
  targetValue: number;
}
