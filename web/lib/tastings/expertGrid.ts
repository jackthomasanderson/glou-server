import type { TastingNote } from './types';

/** The structured grid of expert mode, in the form's order (#642). */
export const EXPERT_FIELDS = ['robe', 'nez', 'bouche', 'tanin', 'acidite', 'longueurBouche'] as const;

export type ExpertField = (typeof EXPERT_FIELDS)[number];

/** The grid's filled fields only: an empty text or a missing number is left out, 0 is a value. */
export function expertRows(note: Pick<TastingNote, ExpertField>): { field: ExpertField; value: string | number }[] {
  return EXPERT_FIELDS.flatMap((field) => {
    const value = note[field];
    if (value == null || (typeof value === 'string' && value.trim() === '')) return [];
    return [{ field, value }];
  });
}
