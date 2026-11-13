import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { avatarUpload, scanUpload, verifyStoredImage } from '../../src/middleware/upload.middleware';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { IMAGES } from '../support/images';

// #886: a photo picked on the device (avatar, label scan) was judged on its
// declared type only: a file renamed `.jpg` was stored, served as an image or
// sent to the recognition model. The bytes are now checked, as for downloads.

const app = express();
app.post('/avatar', avatarUpload.single('avatar'), verifyStoredImage, (req, res) => {
  res.json({ filename: req.file?.filename });
});
app.post('/scan', scanUpload.single('photo'), verifyStoredImage, (req, res) => {
  res.json({ filename: req.file?.filename, path: req.file?.path });
});
app.use(errorMiddleware);

const dirs = { avatar: path.join(process.cwd(), 'uploads', 'avatars'), scan: path.join(process.cwd(), 'uploads', 'scans') };
const listing = (dir: string) => new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
let before: Record<keyof typeof dirs, Set<string>>;
const added = (route: keyof typeof dirs) => [...listing(dirs[route])].filter((name) => !before[route].has(name));

beforeEach(() => {
  before = { avatar: listing(dirs.avatar), scan: listing(dirs.scan) };
});
afterEach(() => {
  for (const route of ['avatar', 'scan'] as const) {
    for (const name of added(route)) fs.rmSync(path.join(dirs[route], name), { force: true });
  }
});

describe.each([
  ['avatar', 'avatar'],
  ['scan', 'photo'],
] as const)('%s upload (#886)', (route, field) => {
  it('refuses a text file renamed .jpg and keeps nothing on disk', async () => {
    const res = await request(app).post(`/${route}`)
      .attach(field, Buffer.from('not a photo at all\n'), { filename: 'label.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
    expect(added(route)).toEqual([]);
  });

  it('refuses a photo cut short and keeps nothing on disk', async () => {
    const res = await request(app).post(`/${route}`)
      .attach(field, IMAGES.jpg.subarray(0, 300), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('IMAGE_DAMAGED');
    expect(added(route)).toEqual([]);
  });

  it('keeps a real photo, under the extension of its bytes', async () => {
    const res = await request(app).post(`/${route}`)
      .attach(field, IMAGES.webp, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.filename).toMatch(/^[\w-]+\.webp$/);
    expect(added(route)).toEqual([res.body.filename]);
  });
});
