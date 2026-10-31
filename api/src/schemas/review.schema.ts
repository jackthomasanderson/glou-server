import { z } from 'zod';
import { MAX_REVIEW_FAMILIES, REVIEW_FIELDS } from '../../../shared/review';

const familyId = z.string().min(1).max(100);
const familyIds = z.array(familyId).min(2).max(MAX_REVIEW_FAMILIES)
  .refine((ids) => new Set(ids).size === ids.length, 'Each family once');

/**
 * #471 (FEAT-102 c2): POST /api/products/merge — the families of one wine
 * and, per compared field, the family whose value is kept (decision #471,
 * point 40). Only ids: a member picks one of the values shown, never types one.
 */
export const mergeSchema = z.object({
  productIds: familyIds,
  choices: z.partialRecord(z.enum(REVIEW_FIELDS), familyId).optional(),
}).strict();

/**
 * #471 (FEAT-102 c3, FEAT-97): POST /api/products/distinctions — families of
 * one wine to remember as different wines ("Garder séparées", "C'est un autre vin").
 */
export const distinctionsSchema = z.object({ productIds: familyIds }).strict();
