import { describe, it, expect } from 'vitest';
import { backupRestoreSchema, backupDownloadSchema, purgeSchema } from '../../src/schemas/backup.schema';

// #489: the most destructive admin actions re-ask the admin's password.
describe('re-authenticated admin actions (#489)', () => {
  it('restore needs the explicit confirmation and a password', () => {
    expect(backupRestoreSchema.safeParse({ confirm: true }).success).toBe(false);
    expect(backupRestoreSchema.safeParse({ confirm: true, password: 'x' }).success).toBe(true);
  });

  it('download needs a password', () => {
    expect(backupDownloadSchema.safeParse({}).success).toBe(false);
    expect(backupDownloadSchema.safeParse({ password: 'x' }).success).toBe(true);
  });

  it('purge needs the protocol keyword and a password', () => {
    expect(purgeSchema.safeParse({ confirmation: 'SUPPRIMER' }).success).toBe(false);
    expect(purgeSchema.safeParse({ confirmation: 'DELETE', password: 'x' }).success).toBe(false);
    expect(purgeSchema.safeParse({ confirmation: 'SUPPRIMER', password: 'x' }).success).toBe(true);
  });
});
