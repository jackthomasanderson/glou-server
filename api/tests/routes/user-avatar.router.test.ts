import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// #880: a member could point their own `avatarUrl` at another member's file
// through PATCH /api/user/profile, then have DELETE /api/user/avatar (or the
// account purge) remove that file from disk.

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
}));
vi.mock('../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = 'u1';
    next();
  },
  getClientIp: () => '127.0.0.1',
}));

import userRouter from '../../src/routes/user.router';
import { prisma } from '../../src/lib/prisma';
import { authService } from '../../src/services/auth.service';

const app = express();
app.use(express.json());
app.use('/api/user', userRouter);

const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
const written: string[] = [];

/** Writes an avatar file on disk, as the upload route would, and returns its stored path. */
function anAvatarFile(): { file: string; avatarUrl: string } {
  fs.mkdirSync(avatarsDir, { recursive: true });
  const name = `${crypto.randomUUID()}.png`;
  const file = path.join(avatarsDir, name);
  fs.writeFileSync(file, 'png');
  written.push(file);
  return { file, avatarUrl: `/uploads/avatars/${name}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.update).mockImplementation((async (args: { data: Record<string, unknown> }) => ({ id: 'u1', ...args.data })) as never);
  vi.mocked(prisma.user.count).mockResolvedValue(0 as never);
});

afterEach(() => {
  for (const file of written.splice(0)) fs.rmSync(file, { force: true });
});

describe('PATCH /api/user/profile', () => {
  it('ignores an avatarUrl: only the upload route sets it', async () => {
    const res = await request(app)
      .patch('/api/user/profile')
      .send({ displayName: 'Marie', appName: 'Cave', avatarUrl: '/uploads/avatars/0b8f2a4e-other-member.png' });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const { data } = vi.mocked(prisma.user.update).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty('avatarUrl');
    expect(data).toMatchObject({ displayName: 'Marie', appName: 'Cave' });
  });

  it('still saves the name fields the profile form sends', async () => {
    const res = await request(app)
      .patch('/api/user/profile')
      .send({ displayName: '  Marie  ', appName: '', appSlogan: 'Santé' });

    expect(res.status).toBe(200);
    const { data } = vi.mocked(prisma.user.update).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toEqual({ displayName: 'Marie', appName: '', appSlogan: 'Santé' });
  });
});

describe('DELETE /api/user/avatar', () => {
  it('removes the caller\'s own uploaded file and clears the field', async () => {
    const own = anAvatarFile();
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ avatarUrl: own.avatarUrl } as never);

    const res = await request(app).delete('/api/user/avatar');

    expect(res.status).toBe(200);
    expect(fs.existsSync(own.file)).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ avatarUrl: null }) }));
  });

  it('never removes a file another member still uses, but clears the caller\'s field', async () => {
    // The caller's avatarUrl was pointed at another member's file before #880.
    const othersFile = anAvatarFile();
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ avatarUrl: othersFile.avatarUrl } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(1 as never);

    const res = await request(app).delete('/api/user/avatar');

    expect(res.status).toBe(200);
    expect(fs.existsSync(othersFile.file)).toBe(true);
    const name = path.basename(othersFile.file);
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { id: { notIn: ['u1'] }, avatarUrl: { endsWith: `/${name}` } } });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ avatarUrl: null }) }));
  });

  it('removes no file for a stored value the upload route never produced', async () => {
    const file = anAvatarFile();
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ avatarUrl: `https://elsewhere.example${file.avatarUrl}` } as never);

    const res = await request(app).delete('/api/user/avatar');

    expect(res.status).toBe(200);
    expect(fs.existsSync(file.file)).toBe(true);
  });
});

describe('authService.deleteAvatarFiles (account purge)', () => {
  it('removes a purged account\'s file, but not one another member still uses', async () => {
    const purged = anAvatarFile();
    const shared = anAvatarFile();
    vi.mocked(prisma.user.count).mockImplementation((async (args: { where: { avatarUrl: { endsWith: string } } }) =>
      args.where.avatarUrl.endsWith.endsWith(path.basename(shared.file)) ? 1 : 0) as never);

    await authService.deleteAvatarFiles([purged.avatarUrl, shared.avatarUrl]);

    expect(fs.existsSync(purged.file)).toBe(false);
    expect(fs.existsSync(shared.file)).toBe(true);
  });
});
