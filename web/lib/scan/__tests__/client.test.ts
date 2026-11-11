import { describe, it, expect, vi, afterEach } from 'vitest';

// #609: the photo is shrunk in the browser before it is sent (stand-in: renames it).
const downscaleImage = vi.fn<(file: File, maxSide?: number) => Promise<File>>(async (file) => new File([file], `small-${file.name}`, { type: file.type }));
vi.mock('@/lib/image-resize', () => ({ downscaleImage: (file: File, maxSide?: number) => downscaleImage(file, maxSide) }));

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

describe('scanClient.upload photo preparation', () => {
  it('sends a downscaled copy of the photo, longest side 1,600 px (#609)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { jobId: 'j1' } }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await scanClient.upload(photo);
    expect(downscaleImage).toHaveBeenCalledWith(photo, 1600);
    const sent = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect((sent.get('photo') as File).name).toBe('small-label.jpg');
  });

  it.each([
    ['image/heic', 'IMG_0001.HEIC'],
    ['image/heif', 'IMG_0001.heif'],
    ['', 'IMG_0001.heic'],
  ])('refuses a HEIC photo (%s %s) without sending it (#808)', async (type, name) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(scanClient.upload(new File(['x'], name, { type }))).rejects.toThrow('HEIC_NOT_SUPPORTED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
