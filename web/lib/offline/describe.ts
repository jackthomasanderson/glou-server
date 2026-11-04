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

const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

/**
 * Review of #823: whether the unit as the server has it now is exactly what
 * this change would have made of it — the connection may then have dropped
 * while it was being sent, and the change be already recorded. Looks at
 * what the action moves: a group's number (one copy taken off it, or the
 * number corrected), the cigars left in an opened box, a single bottle
 * finished or opened.
 */
export function mayAlreadyBeRecorded(
  m: Pick<QueuedMutation, 'kind' | 'patch' | 'before'>,
  server: Record<string, unknown> | undefined,
): boolean {
  const action = actionOf(m);
  if (action === 'edit' || !server) return false;
  const now = num(server.quantity);
  if (action === 'correct') return now === Number(m.patch.quantity);
  const before = m.before ?? {};
  const then = num(before.quantity) ?? 1;
  const wasIntact = before.isOpened !== true && before.cigarsLeft == null;
  // A copy taken off a group of several: the group is one fewer.
  if (wasIntact && then > 1) return now === then - 1;
  // A unit changed itself.
  const finished = server.isOpened === true && server.fillLevel === 0;
  if (action === 'drink') return finished;
  if (action === 'open') return server.isOpened === true;
  // Smoking: one cigar fewer in the box (its first one, or its last one).
  const perBox = num(server.cigarsPerBox) ?? num(before.cigarsLeft);
  const left = before.isOpened === true ? num(before.cigarsLeft) : perBox;
  if (left == null) return finished; // a single cigar
  return left - 1 <= 0 ? finished : server.isOpened === true && num(server.cigarsLeft) === left - 1;
}
