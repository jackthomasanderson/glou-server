import { z } from 'zod';

// FEAT-54: Network Configuration & External Access — `publicUrl` null/omitted
// means the instance falls back to the APP_URL environment variable.
export const networkConfigSchema = z.object({
  publicUrl: z.string().url().optional().nullable(),
  accessMode: z.enum(['direct', 'proxy']),
});

export type NetworkConfigSchemaInput = z.infer<typeof networkConfigSchema>;
