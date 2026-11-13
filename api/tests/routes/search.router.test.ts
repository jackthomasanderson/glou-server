import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

// #862: the photo suggestion searched "producer name" alone (a ball bearing for
// "ZZ C5 Petit") and the download stored whatever the remote host answered,
// a page that is not an image included (a broken photo on the card).

vi.mock('../../src/middleware/auth.middleware', () => ({
  authMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
vi.mock('../../src/lib/ssrf', () => ({
  assertUrlAllowed: vi.fn(async () => undefined),
  resolveSafeUrl: vi.fn(),
}));

import searchRouter from '../../src/routes/search.router';
import { resolveSafeUrl } from '../../src/lib/ssrf';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { IMAGES } from '../support/images';

const app = express();
app.use(express.json());
app.use('/api/search', searchRouter);
app.use(errorMiddleware);

const PNG = IMAGES.png;
const JPEG = IMAGES.jpg;

function remoteAnswer(body: Buffer | string, contentType: string) {
  vi.mocked(resolveSafeUrl).mockResolvedValue(
    new Response(body, { status: 200, headers: { 'content-type': contentType } }),
  );
}

let written: Array<[string, Buffer]>;
beforeEach(() => {
  vi.clearAllMocks();
  written = [];
  vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data) => {
    written.push([String(file), data as Buffer]);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('POST /api/search/images/save (#862)', () => {
  it('stores a real PNG under its own extension', async () => {
    remoteAnswer(PNG, 'image/png');
    const res = await request(app).post('/api/search/images/save').send({ url: 'https://example.com/a.png' });
    expect(res.status).toBe(200);
    expect(res.body.data.path).toMatch(/^\/uploads\/products\/[\w-]+\.png$/);
    expect(written).toHaveLength(1);
  });

  it('takes the extension from the bytes, not from a wrong content type', async () => {
    remoteAnswer(JPEG, 'image/png');
    const res = await request(app).post('/api/search/images/save').send({ url: 'https://example.com/a.png' });
    expect(res.status).toBe(200);
    expect(res.body.data.path).toMatch(/\.jpg$/);
  });

  it('refuses an HTML page served as an image and stores nothing', async () => {
    remoteAnswer('<!DOCTYPE html><html><body>Hotlinking forbidden</body></html>', 'image/jpeg');
    const res = await request(app).post('/api/search/images/save').send({ url: 'https://example.com/a.jpg' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'INVALID_IMAGE_TYPE' });
    expect(written).toHaveLength(0);
  });

  it('refuses an empty answer and stores nothing', async () => {
    remoteAnswer(Buffer.alloc(0), 'image/jpeg');
    const res = await request(app).post('/api/search/images/save').send({ url: 'https://example.com/a.jpg' });
    expect(res.status).toBe(422);
    expect(written).toHaveLength(0);
  });

  it.each(['binary/octet-stream', 'application/octet-stream', 'text/plain'])(
    'stores a real image served with a wrong content type (%s)',
    async (contentType) => {
      remoteAnswer(PNG, contentType);
      const res = await request(app).post('/api/search/images/save').send({ url: 'https://example.com/a' });
      expect(res.status).toBe(200);
      expect(res.body.data.path).toMatch(/\.png$/);
    },
  );

  it('refuses an answer declared as an HTML page even with an image extension in the URL', async () => {
    remoteAnswer(PNG, 'text/html');
    const res = await request(app).post('/api/search/images/save').send({ url: 'https://example.com/a.png' });
    expect(res.status).toBe(422);
    expect(written).toHaveLength(0);
  });
});

describe('POST /api/search/images/save — a download cut short (#886)', () => {
  it('refuses a JPEG whose body stops before its end and stores nothing', async () => {
    remoteAnswer(JPEG.subarray(0, JPEG.length - 40), 'image/jpeg');
    const res = await request(app).post('/api/search/images/save').send({ url: 'https://example.com/a.jpg' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'IMAGE_DAMAGED' });
    expect(written).toHaveLength(0);
  });
});

describe('POST /api/search/images/upload (#886)', () => {
  const productsDir = path.join(process.cwd(), 'uploads', 'products');
  const stored = () => new Set(fs.readdirSync(productsDir));
  let before: Set<string>;
  beforeEach(() => { before = stored(); });
  afterEach(() => {
    for (const name of stored()) if (!before.has(name)) fs.rmSync(path.join(productsDir, name), { force: true });
  });
  const added = () => [...stored()].filter((name) => !before.has(name));

  it('refuses a text file renamed .jpg and keeps nothing on disk', async () => {
    const res = await request(app).post('/api/search/images/upload')
      .attach('image', Buffer.from('Château Margaux 2015, 6 bottles\n'), { filename: 'label.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILE_TYPE');
    expect(added()).toEqual([]);
  });

  it('refuses a photo cut short and keeps nothing on disk', async () => {
    const res = await request(app).post('/api/search/images/upload')
      .attach('image', PNG.subarray(0, PNG.length - 12), { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('IMAGE_DAMAGED');
    expect(added()).toEqual([]);
  });

  it('stores a real photo under the extension of its bytes, not of its declared type', async () => {
    const res = await request(app).post('/api/search/images/upload')
      .attach('image', JPEG, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.data.path).toMatch(/^\/uploads\/products\/[\w-]+\.jpg$/);
    expect(added()).toEqual([path.basename(res.body.data.path)]);
  });
});

describe('GET /api/search/images (#862)', () => {
  function stubDuckDuckGo() {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes('i.js')) {
        return new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } });
      }
      return new Response("<script>vqd='4-123'</script>");
    });
    vi.stubGlobal('fetch', fetchMock);
    return () => new URL(String(fetchMock.mock.calls.find(([url]) => String(url).includes('i.js'))?.[0])).searchParams.get('q');
  }

  it.each([
    ['wine', 'Domaine Y Cuvée X wine bottle'],
    ['sparkling', 'Domaine Y Cuvée X champagne bottle'],
    ['spirit', 'Domaine Y Cuvée X bottle'],
    ['cigar', 'Domaine Y Cuvée X cigar'],
  ])('adds what is searched for to the query of a %s', async (category, expected) => {
    const sentQuery = stubDuckDuckGo();
    await request(app).get('/api/search/images').query({ q: 'Domaine Y Cuvée X', category });
    expect(sentQuery()).toBe(expected);
  });

  it('keeps the query as typed without a known category (manual search)', async () => {
    const sentQuery = stubDuckDuckGo();
    await request(app).get('/api/search/images').query({ q: 'Domaine Y Cuvée X' });
    expect(sentQuery()).toBe('Domaine Y Cuvée X');
  });
});
