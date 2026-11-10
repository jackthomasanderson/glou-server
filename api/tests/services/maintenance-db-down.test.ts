import { describe, it, expect, beforeEach, vi } from 'vitest';

// #634 — when the database itself is down (PostgreSQL restarting at 3 AM),
// the cleanup transaction fails AND so does the write of the failed
// MaintenanceRun record. That second rejection escaped runRetentionCleanup,
// nobody caught it in index.ts, and the unhandled rejection stopped the API.

const transaction = vi.fn();
const maintenanceRunCreate = vi.fn();
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: (...a: unknown[]) => transaction(...a),
    maintenanceRun: { create: (...a: unknown[]) => maintenanceRunCreate(...a) },
  },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn(), purgeOldAuditLogs: vi.fn().mockResolvedValue(0) }));

import { MaintenanceService } from '../../src/services/maintenance.service';

describe('retention cleanup with the database down (#634)', () => {
  beforeEach(() => {
    transaction.mockReset();
    maintenanceRunCreate.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('resolves with an unsaved failed run when recording the failure also fails', async () => {
    transaction.mockRejectedValue(new Error("Can't reach database server"));
    maintenanceRunCreate.mockRejectedValue(new Error("Can't reach database server"));

    const run = await MaintenanceService.runRetentionCleanup('scheduled');

    expect(maintenanceRunCreate).toHaveBeenCalledTimes(1);
    expect(run.success).toBe(false);
    expect(run.trigger).toBe('scheduled');
    expect(run.error).toBe("Can't reach database server");
  });

  it('still returns the recorded run when the failure record can be written', async () => {
    transaction.mockRejectedValue(new Error('boom'));
    maintenanceRunCreate.mockResolvedValue({ id: 'm1', success: false, error: 'boom' });

    const run = await MaintenanceService.runRetentionCleanup('manual', 'u1');

    expect(run).toEqual({ id: 'm1', success: false, error: 'boom' });
  });
});
