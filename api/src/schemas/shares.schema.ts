import { z } from 'zod';

const DEFAULT_SHARE_EXPIRY_DAYS = 30;

function defaultExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + DEFAULT_SHARE_EXPIRY_DAYS);
  return d.toISOString();
}

export const shareCreateSchema = z
  .object({
    label: z.string().max(100).optional(),
    // Display name of the invited person (FEAT-37) — distinct from `label`, purely informational.
    inviteeName: z.string().max(100).optional(),
    // ISSUE_046: omitting this field used to mean "never expires". `.default`
    // only ever fires on `undefined`, never on an explicit `null` — so the
    // web form's "unlimited" duration (which sends `null` on purpose, see
    // ShareForm.tsx's computeExpiresAt) still works exactly as before; only
    // a caller that doesn't think about expiry at all now gets 30 days
    // instead of forever.
    expiresAt: z.string().datetime().nullable().default(defaultExpiresAt),
    hidePrices: z.boolean().default(false),
    hideNotes: z.boolean().default(false),
    cellarIds: z.array(z.string()).default([]),
    collectionIds: z.array(z.string()).default([]),
    // Subset of cellarIds granted read/write access (FEAT-37).
    writeCellarIds: z.array(z.string()).default([]),
  })
  .refine((data) => data.writeCellarIds.every((id) => data.cellarIds.includes(id)), {
    message: 'writeCellarIds must be a subset of cellarIds',
    path: ['writeCellarIds'],
  })
  // ISSUE_046: no cellar and no collection ticked used to mean "the whole
  // inventory", the opposite of what a share link should default to.
  .refine((data) => data.cellarIds.length > 0 || data.collectionIds.length > 0, {
    message: 'A share must expose at least one cellar or collection',
    path: ['cellarIds'],
  });

export type ShareCreateInput = z.infer<typeof shareCreateSchema>;
