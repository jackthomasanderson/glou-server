import { describe, it, expect, beforeEach, vi } from 'vitest';

// #639: a failed job kept the raw infrastructure message, which the client never
// read, so every failure was shown as a blurry photo. The job now stores a code
// the client can turn into the right message; the raw cause stays in the logs.

const update = vi.fn();
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    scanJob: {
      findUnique: vi.fn().mockResolvedValue({ id: 'j1', imagePath: '/uploads/scans/a.jpg' }),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));
vi.mock('fs/promises', () => ({ default: { readFile: vi.fn().mockResolvedValue(Buffer.from('img')) } }));

const analyzeLabelImage = vi.fn();
vi.mock('../../src/services/ocr.service', async (importActual) => {
  const actual = await importActual<typeof import('../../src/services/ocr.service')>();
  return { ...actual, analyzeLabelImage: (...a: unknown[]) => analyzeLabelImage(...a) };
});

import { scanService } from '../../src/services/scan.service';
import { OcrError } from '../../src/services/ocr.service';

function lastJobUpdate(): unknown {
  return update.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  update.mockReset();
  analyzeLabelImage.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('scanService.processJob failure code', () => {
  it('stores the cause the recognition service reported', async () => {
    analyzeLabelImage.mockRejectedValue(new OcrError('SCAN_TIMEOUT'));
    await scanService.processJob('j1');
    expect(lastJobUpdate()).toEqual({ where: { id: 'j1' }, data: { status: 'failed', errorMessage: 'SCAN_TIMEOUT' } });
  });

  it('stores SCAN_FAILED, not the raw message, for an unexpected error', async () => {
    analyzeLabelImage.mockRejectedValue(new Error('connect ECONNREFUSED 172.18.0.5:11434'));
    await scanService.processJob('j1');
    expect(lastJobUpdate()).toEqual({ where: { id: 'j1' }, data: { status: 'failed', errorMessage: 'SCAN_FAILED' } });
  });

  it('still marks a job done with what the model extracted', async () => {
    analyzeLabelImage.mockResolvedValue({ name: 'Margaux' });
    await scanService.processJob('j1');
    expect(lastJobUpdate()).toEqual({
      where: { id: 'j1' },
      data: { status: 'done', extractedData: { name: 'Margaux' }, errorMessage: null },
    });
  });
});
