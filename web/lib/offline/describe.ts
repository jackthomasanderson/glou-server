import type { QueuedMutation } from './db';
import { actionOf } from './optimistic';

// FEAT-108: a queued change in words, for the pending changes panel and the
// conflict dialog.

/**
 * FEAT-108 (review of K): a change refused when it was replayed, said in
 * words — the API's code when it is known, else its raw reason.
 */
const REFUSALS: Record<string, string> = {
  TASTINGS_ON_ITEM: 'toast.tastingsOnBottle',
  FIELDS_WITH_REATTACH: 'toast.fieldsWithReattach',
  BOX_NOT_COMPLETE: 'toast.boxNotComplete',
  NOTHING_LEFT_TO_SMOKE: 'toast.nothingLeftToSmoke',
  INDIVIDUAL_STATE_ON_GROUP: 'offline.errors.notOneBottle',
  NOT_A_GROUP: 'offline.errors.notAGroup',
  QUANTITY_NOT_LOWER: 'offline.errors.notLower',
  QUANTITY_BELOW_ONE: 'offline.errors.belowOne',
  ITEM_NOT_FOUND: 'offline.errors.gone',
  VALIDATION_ERROR: 'offline.errors.rejected',
  CONFLICT: 'offline.errors.changed',
};

/** What a queued change does, in words: "J'en ouvre une", "Nombre corrigé : 6 → 5". */
export function changeLabel(m: Pick<QueuedMutation, 'kind' | 'patch' | 'before'>, t: (key: string, values?: Record<string, unknown>) => string): string | null {
  const action = actionOf(m);
  if (action === 'edit') return null;
  if (action === 'correct') return t('offline.actions.correct', { from: m.before?.quantity ?? '?', to: m.patch.quantity });
  return t(`openDrink.actions.${action}`);
}

/** The message of a refusal the API gave a code for, if it has one. */
export const refusalKey = (code: string | undefined): string | undefined => (code ? REFUSALS[code] : undefined);
