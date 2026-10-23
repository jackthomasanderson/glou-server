import { describe, it, expect, vi, afterEach } from 'vitest';
import { scanClient } from '../client';

// #639: a reverse proxy rejects an oversized photo or a burst of uploads with an
// HTML page; reading it as JSON threw, and the user got the generic message.

const photo = new File(['x'], 'label.jpg', { type: 'image/jpeg' });

function stubFetch(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scanClient.upload error codes', () => {
  it('passes on the API error code', async () => {
    stubFetch(new Response(JSON.stringify({ error: 'SCAN_UNAVAILABLE' }), { status: 503 }));
    await expect(scanClient.upload(photo)).rejects.toThrow('SCAN_UNAVAILABLE');
  });

  it('reads a proxy 413 page as a photo that is too large', async () => {
    stubFetch(new Response('<html>413 Request Entity Too Large</html>', { status: 413 }));
    await expect(scanClient.upload(photo)).rejects.toThrow('FILE_TOO_LARGE');
  });

  it('reads a proxy 429 page as the scan quota', async () => {
    stubFetch(new Response('<html>Too Many Requests</html>', { status: 429 }));
    await expect(scanClient.upload(photo)).rejects.toThrow('SCAN_RATE_LIMITED');
  });

  it('returns the job id when the photo is accepted', async () => {
    stubFetch(new Response(JSON.stringify({ data: { jobId: 'j1' } }), { status: 202 }));
    await expect(scanClient.upload(photo)).resolves.toEqual({ jobId: 'j1' });
  });
});
