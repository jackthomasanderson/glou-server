import { todayLocalIso } from '@/lib/format';
import type { TastingFormValues, TastingNote } from './types';

/** Values of the tasting form for a new tasting. */
export function blankTastingValues(itemId?: string, foodPairing?: string): TastingFormValues {
  return {
    itemId,
    rating: null,
    readiness: null,
    notes: '',
    context: '',
    foodPairing: foodPairing ?? '',
    tastedAt: todayLocalIso(),
    robe: null,
    nez: null,
    bouche: null,
    tanin: null,
    acidite: null,
    longueurBouche: null,
  };
}

/**
 * Values of the tasting form for editing a saved tasting: every field the
 * form holds, so saving it unchanged keeps the tasting as it was (#642).
 */
export function tastingToFormValues(note: TastingNote): TastingFormValues {
  const values = {
    itemId: note.itemId ?? undefined,
    tastedAt: note.tastedAt.split('T')[0],
    context: note.context ?? '',
    rating: note.rating ?? null,
    readiness: note.readiness ?? null,
    notes: note.notes ?? '',
    foodPairing: note.foodPairing ?? '',
    photoUrl: note.photoUrl ?? null,
    robe: note.robe ?? null,
    nez: note.nez ?? null,
    bouche: note.bouche ?? null,
    tanin: note.tanin ?? null,
    acidite: note.acidite ?? null,
    longueurBouche: note.longueurBouche ?? null,
  } satisfies Record<keyof TastingFormValues, unknown>;
  return values;
}
