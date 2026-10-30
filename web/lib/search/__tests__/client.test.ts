import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchClient, UPLOAD_TIMEOUT_MS } from '../client';
import { DEFAULT_TIMEOUT_MS } from '../../api';
import config from '../../../next.config.mjs';

// #645: a photo upload had no deadline: over a stalled connection the request
// never ended and the photo kept its loading overlay.

const photo = new File(['x'], 'label.jpg', { type: 'image/jpeg' });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('searchClient.uploadImage', () => {
  it('gives the upload a deadline', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { path: '/uploads/products/a.jpg' } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchClient.uploadImage(photo)).resolves.toBe('/uploads/products/a.jpg');

    expect(timeout).toHaveBeenCalledWith(UPLOAD_TIMEOUT_MS);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('gives up after the deadline, before the /api proxy does', () => {
    const proxyTimeout = (config('phase-production-build') as { experimental?: { proxyTimeout?: number } }).experimental?.proxyTimeout ?? 30_000;
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
    expect(UPLOAD_TIMEOUT_MS).toBeLessThan(proxyTimeout);
  });

  it('reads a proxy 413 page as a photo that is too large', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>413</html>', { status: 413 })));
    await expect(searchClient.uploadImage(photo)).rejects.toThrow('FILE_TOO_LARGE');
  });

  it('reads a proxy 415 page as an unsupported format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>415</html>', { status: 415 })));
    await expect(searchClient.uploadImage(photo)).rejects.toThrow('INVALID_FILE_TYPE');
  });
});
