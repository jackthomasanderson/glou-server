import { z } from 'zod';

// #636: an admin's change to a member's role or status. The admin's own
// re-authentication fields (password, code) are read by adminReauthSchema.

export const memberRoleSchema = z.object({
  isAdmin: z.boolean(),
});

export const memberStatusSchema = z.object({
  isActive: z.boolean(),
});
