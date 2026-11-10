import { z } from 'zod';
import { MANUFACTURE_YEAR_MIN, VINTAGE_MIN } from '../../../shared/inventory';

// #624: the vintage rule was copied in eight places across four schemas and
// had drifted (the patch lost the bounds of baseYear and manufactureYear,
// the wishlist accepted next year). Every schema builds its years here.

/** A year from `min` to this year; `message` replaces every error message (the CSV import's codes). */
const pastYearSchema = (min: number, message?: string) =>
  z.number(message ? { error: message } : undefined).int(message).min(min, message).max(new Date().getFullYear(), message);

/** A vintage, or the base year of a sparkling wine. */
export const vintageSchema = (message?: string) => pastYearSchema(VINTAGE_MIN, message);

/** The manufacture year of a cigar box. */
export const manufactureYearSchema = (message?: string) => pastYearSchema(MANUFACTURE_YEAR_MIN, message);
