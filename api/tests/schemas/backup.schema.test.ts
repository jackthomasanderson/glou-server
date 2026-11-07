import { describe, it, expect } from 'vitest';
import { backupRestoreSchema, purgeSchema } from '../../src/schemas/backup.schema';

// #489: the most destructive admin actions need an explicit confirmation. The
// admin's password and code are checked by the step-up (#890), see
// tests/integration/admin-step-up.test.ts.
describe('confirmed admin actions (#489)', () => {
  it('restore needs the explicit confirmation', () => {
    expect(backupRestoreSchema.safeParse({}).success).toBe(false);
    expect(backupRestoreSchema.safeParse({ confirm: true }).success).toBe(true);
  });

  it('purge needs the protocol keyword', () => {
    expect(purgeSchema.safeParse({ confirmation: 'DELETE' }).success).toBe(false);
    expect(purgeSchema.safeParse({ confirmation: 'SUPPRIMER' }).success).toBe(true);
  });
});
