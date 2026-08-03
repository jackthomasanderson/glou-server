export interface BudgetEnvelope {
  id: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetEnvelopeInput {
  periodStart: string;
  periodEnd: string;
  amount: number;
}

export interface BudgetProgress {
  envelope: BudgetEnvelope;
  spent: number;
  remaining: number;
  percent: number;
}
