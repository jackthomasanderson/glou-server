import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    bulkPreset: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/lib/prisma';
import { bulkPresetService } from '../../src/services/bulk-preset.service';

beforeEach(() => vi.clearAllMocks());

describe('listPresets', () => {
  it('scopes to the caller and orders by name', async () => {
    vi.mocked(prisma.bulkPreset.findMany).mockResolvedValue([] as never);

    await bulkPresetService.listPresets('u1');

    expect(prisma.bulkPreset.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { name: 'asc' },
    });
  });
});

describe('createPreset', () => {
  it('creates a preset scoped to the caller with the given payload', async () => {
    vi.mocked(prisma.bulkPreset.create).mockResolvedValue({ id: 'p1' } as never);

    const result = await bulkPresetService.createPreset('u1', {
      name: 'Weekly delivery',
      payload: { category: 'wine' },
    } as never);

    expect(result).toEqual({ id: 'p1' });
    const call = vi.mocked(prisma.bulkPreset.create).mock.calls[0]?.[0] as {
      data: { userId: string; name: string; payload: unknown; id: string };
    };
    expect(call.data.userId).toBe('u1');
    expect(call.data.name).toBe('Weekly delivery');
    expect(call.data.payload).toEqual({ category: 'wine' });
    expect(typeof call.data.id).toBe('string');
    expect(call.data.id.length).toBeGreaterThan(0);
  });
});

describe('deletePreset', () => {
  it('deletes only a preset owned by the caller', async () => {
    vi.mocked(prisma.bulkPreset.delete).mockResolvedValue({} as never);

    await bulkPresetService.deletePreset('u1', 'p1');

    expect(prisma.bulkPreset.delete).toHaveBeenCalledWith({
      where: { id: 'p1', userId: 'u1' },
    });
  });

  it('propagates the error when the preset does not belong to the caller', async () => {
    vi.mocked(prisma.bulkPreset.delete).mockRejectedValue(new Error('Record not found'));

    await expect(bulkPresetService.deletePreset('u1', 'missing')).rejects.toThrow('Record not found');
  });
});
