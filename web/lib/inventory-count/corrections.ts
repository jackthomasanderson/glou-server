import type { CountLine, Correction, CountUnexpectedItem } from './types';

/**
 * #471 (FEAT-100, ux-ui §10.11): what a member may do with the missing
 * copies of a line — nothing, "Bues", or "Corriger le nombre" with its
 * reason. An opened bottle has no number to correct; an input error never
 * takes a group to zero (the trash is for the whole line).
 */
export type MissingChoice = 'none' | 'drunk' | 'input_error' | 'written_off';

export function missingChoices(line: CountLine): MissingChoice[] {
  if (!line.isGroup) return ['none', 'drunk'];
  const choices: MissingChoice[] = ['none', 'drunk'];
  if (line.missingQuantity < line.expectedQuantity) choices.push('input_error');
  choices.push('written_off');
  return choices;
}

/** What a find becomes at closure: kept aside, a new wine, or copies of a known one. */
export interface FindChoice {
  add: boolean;
  /** The known wine it joins; null for a new wine. */
  productId: string | null;
}

/**
 * By default a find joins THE known wine of its name (ux-ui §10.11) — only
 * when there is exactly one: among several, guessing could put the bottles
 * in the wrong wine, so it stays a new wine until the member picks one.
 */
export function defaultFindChoice(find: CountUnexpectedItem): FindChoice {
  return { add: false, productId: find.matchingProducts.length === 1 ? find.matchingProducts[0].id : null };
}

export interface ReportChoices {
  missing: Record<string, MissingChoice>;
  /** Lines whose copies found in excess are added to their group. */
  surplus: Set<string>;
  /** Existing units found here although recorded elsewhere. */
  move: Set<string>;
  finds: Record<string, FindChoice>;
}

/**
 * The corrections sent at closure. Counts are left to the server (the
 * difference between expected and found), so a report a little out of date
 * never corrects more than what is missing now.
 */
export function buildCorrections(choices: ReportChoices): Correction[] {
  const corrections: Correction[] = [];
  for (const [itemId, choice] of Object.entries(choices.missing)) {
    if (choice === 'drunk') corrections.push({ itemId, action: 'mark_consumed' });
    else if (choice !== 'none') corrections.push({ itemId, action: 'correct_quantity', reason: choice });
  }
  for (const itemId of choices.surplus) corrections.push({ itemId, action: 'add_units' });
  for (const itemId of choices.move) corrections.push({ itemId, action: 'move_to_scope' });
  for (const [entryId, find] of Object.entries(choices.finds)) {
    if (!find.add) continue;
    corrections.push(find.productId ? { entryId, action: 'add_to_stock', productId: find.productId } : { entryId, action: 'add_to_stock' });
  }
  return corrections;
}
