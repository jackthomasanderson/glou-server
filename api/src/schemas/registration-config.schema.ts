import { z } from 'zod';

// ISSUE_001/#73: toggle for POST /api/auth/register once the instance's
// first account (the admin) already exists.
export const registrationConfigSchema = z.object({
  registrationOpen: z.boolean(),
});

export type RegistrationConfigSchemaInput = z.infer<typeof registrationConfigSchema>;
