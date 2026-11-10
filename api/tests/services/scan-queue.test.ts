import { describe, it, expect, beforeEach, vi } from 'vitest';

// #609: every upload started its own call to the model straight away, each
// holding the photo and its base64 copy in memory while the model (which only
// handles one image at a time) made it wait up to 10 minutes. Jobs now run one
// after the other; the waiting ones are only a database row and a file path.

let nextId = 0;
const rows = new Map<string, { id: string; imagePath: string; status: string }>();
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    scanJob: {
      create: vi.fn(async ({ data }: { data: { imagePath: string; status: string } }) => {
        const row = { id: `j${++nextId}`, ...data };
        rows.set(row.id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const row = rows.get(where.id)!;
        row.status = data.status;
        return row;
      }),
    },
  },
}));
const readFile = vi.fn(async (p: string) => Buffer.from(p));
vi.mock('fs/promises', () => ({ default: { readFile: (p: string) => readFile(p) } }));

// Each call to the model waits until the test lets it finish.
const finishers: Array<() => void> = [];
const analyzeLabelImage = vi.fn(
  () => new Promise((resolve) => finishers.push(() => resolve({ name: 'Margaux' }))),
);
vi.mock('../../src/services/ocr.service', async (importActual) => {
  const actual = await importActual<typeof import('../../src/services/ocr.service')>();
  return { ...actual, analyzeLabelImage: () => analyzeLabelImage() };
});

import { scanService } from '../../src/services/scan.service';
import { prisma } from '../../src/lib/prisma';

beforeEach(() => {
  rows.clear();
  finishers.length = 0;
  analyzeLabelImage.mockClear();
  readFile.mockClear();
});

describe('scan jobs are processed one at a time (#609)', () => {
  it('starts the second scan only once the first one is finished', async () => {
    const first = await scanService.createJob('u1', '/uploads/scans/a.jpg');
    const second = await scanService.createJob('u2', '/uploads/scans/b.jpg');

    await vi.waitFor(() => expect(analyzeLabelImage).toHaveBeenCalledTimes(1));
    // Give the second job every chance to start, wrongly, in parallel.
    await new Promise((r) => setTimeout(r, 20));
    expect(analyzeLabelImage).toHaveBeenCalledTimes(1);
    expect(rows.get(second.id)?.status).toBe('pending');
    // The waiting photo is not even read from disk yet.
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith('/uploads/scans/a.jpg');

    finishers[0]();
    await vi.waitFor(() => expect(analyzeLabelImage).toHaveBeenCalledTimes(2));
    expect(rows.get(first.id)?.status).toBe('done');
    expect(rows.get(second.id)?.status).toBe('processing');

    finishers[1]();
    await vi.waitFor(() => expect(rows.get(second.id)?.status).toBe('done'));
  });

  it('fails a job whose database read threw, and keeps going', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(prisma.scanJob.findUnique).mockRejectedValueOnce(new Error('Connection terminated'));
    const broken = await scanService.createJob('u1', '/uploads/scans/gone.jpg');
    const next = await scanService.createJob('u1', '/uploads/scans/c.jpg');

    await vi.waitFor(() => expect(rows.get(broken.id)?.status).toBe('failed'));
    await vi.waitFor(() => expect(analyzeLabelImage).toHaveBeenCalledTimes(1));
    finishers[0]();
    await vi.waitFor(() => expect(rows.get(next.id)?.status).toBe('done'));
  });

  it('keeps going when even marking the job failed throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(prisma.scanJob.findUnique).mockRejectedValueOnce(new Error('Connection terminated'));
    vi.mocked(prisma.scanJob.update).mockRejectedValueOnce(new Error('Connection terminated'));
    await scanService.createJob('u1', '/uploads/scans/gone.jpg');
    const next = await scanService.createJob('u1', '/uploads/scans/c.jpg');

    await vi.waitFor(() => expect(analyzeLabelImage).toHaveBeenCalledTimes(1));
    finishers[0]();
    await vi.waitFor(() => expect(rows.get(next.id)?.status).toBe('done'));
  });
});
