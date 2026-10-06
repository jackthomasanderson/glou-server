import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import fs from 'fs';

// #182 — pg_dump creates the destination file before it has dumped anything. When
// it then failed, the truncated .sql.gz stayed in the backups folder and looked
// like a valid backup (it even gets listed and can be "restored").

const spawnMock = vi.fn();
vi.mock('child_process', () => ({ spawn: (...a: unknown[]) => spawnMock(...a) }));
const runCreate = vi.fn().mockResolvedValue({ id: 'r1', success: false });
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    backupRun: { findFirst: vi.fn().mockResolvedValue(null), create: (...a: unknown[]) => runCreate(...a) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));
vi.mock('../../src/services/notification.service', () => ({ notificationService: { send: vi.fn() } }));

import { backupService, BACKUPS_DIR } from '../../src/services/backup.service';

class FakeDump extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
}

const before = new Set<string>(fs.existsSync(BACKUPS_DIR) ? fs.readdirSync(BACKUPS_DIR) : []);
const created = () => fs.readdirSync(BACKUPS_DIR).filter((f) => !before.has(f));

beforeEach(() => {
  process.env.DATABASE_URL = 'postgresql://glou:pw@db:5432/glou_db';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  for (const f of created()) fs.rmSync(`${BACKUPS_DIR}/${f}`, { force: true });
});

describe('backupService.runBackup — failed dump (#182)', () => {
  it('removes the truncated file and records the failure', async () => {
    const dump = new FakeDump();
    spawnMock.mockReturnValue(dump);
    const run = backupService.runBackup('manual');
    // let the write stream open the file, then fail the dump half way
    await new Promise((r) => setTimeout(r, 50));
    dump.stdout.write('partial');
    dump.emit('close', 1);
    await run;

    expect(created()).toEqual([]);
    expect(runCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ success: false }) }));
  });
});
