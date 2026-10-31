import { describe, it, expect, vi } from 'vitest';

// #471 (F1 review): the full purge kept the families, so a purged instance
// still listed every wine with no bottle. They go too, after their units
// (a family is only deletable once it has none).

const calls: string[] = [];
const deleted = (table: string) => vi.fn(async () => { calls.push(table); return { count: 0 }; });
const tx = {
  inventoryItem: { count: vi.fn().mockResolvedValue(3), deleteMany: deleted('inventoryItem') },
  cellar: { count: vi.fn().mockResolvedValue(1), deleteMany: deleted('cellar') },
  auditLog: { count: vi.fn().mockResolvedValue(5), deleteMany: deleted('auditLog') },
  product: { deleteMany: deleted('product') },
};
vi.mock('../../src/lib/prisma', () => ({
  prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn(), purgeOldAuditLogs: vi.fn() }));

import { MaintenanceService } from '../../src/services/maintenance.service';

describe('MaintenanceService.purgeAllData', () => {
  it('deletes the families after their units, and reports the same counts as before', async () => {
    const result = await MaintenanceService.purgeAllData();

    expect(calls).toEqual(['auditLog', 'inventoryItem', 'product', 'cellar']);
    expect(result).toEqual({ success: true, counts: { items: 3, cellars: 1, auditLogs: 5 } });
  });
});
