import { describe, it, expect, beforeEach, vi } from 'vitest';

// #183 — retention deleted the scan photos from disk INSIDE the database
// transaction. If it rolled back, the rows were restored but the files were
// already gone. The files must only be removed once the transaction committed.

const order: string[] = [];
const unlink = vi.fn(async () => { order.push('unlink'); });
const readdir = vi.fn(async () => []);
vi.mock('fs/promises', () => ({
  default: {
    unlink: (...a: unknown[]) => (unlink as (...x: unknown[]) => unknown)(...a),
    readdir: (...a: unknown[]) => (readdir as (...x: unknown[]) => unknown)(...a),
  },
  unlink: (...a: unknown[]) => (unlink as (...x: unknown[]) => unknown)(...a),
  readdir: (...a: unknown[]) => (readdir as (...x: unknown[]) => unknown)(...a),
}));

const tx = {
  systemConfig: { findUnique: vi.fn().mockResolvedValue(null) },
  session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  trustedDevice: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  guestShare: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  auditLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  scanJob: {
    findMany: vi.fn().mockResolvedValue([{ id: 'j1', imagePath: '/uploads/scans/a.jpg' }]),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  inventoryItem: {
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  maintenanceRun: { create: vi.fn().mockResolvedValue({ id: 'm1', success: true }) },
};
const transaction = vi.fn();
vi.mock('../../src/lib/prisma', () => ({
  prisma: { $transaction: (...a: unknown[]) => transaction(...a), maintenanceRun: { create: vi.fn().mockResolvedValue({ id: 'm2', success: false }) } },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn(), purgeOldAuditLogs: vi.fn().mockResolvedValue(0) }));

import { MaintenanceService } from '../../src/services/maintenance.service';

describe('retention cleanup and scan photos (#183)', () => {
  beforeEach(() => {
    order.length = 0;
    unlink.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('deletes the photos after the transaction has committed', async () => {
    transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => {
      const result = await fn(tx);
      order.push('commit');
      return result;
    });
    await MaintenanceService.runRetentionCleanup('manual');
    expect(order).toEqual(['commit', 'unlink']);
  });

  it('keeps the photos when the transaction rolls back', async () => {
    transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => {
      await fn(tx);
      throw new Error('rollback');
    });
    await MaintenanceService.runRetentionCleanup('manual');
    expect(unlink).not.toHaveBeenCalled();
  });
});
