import { describe, it, expect, beforeEach, vi } from 'vitest';

// #639: the scan was offered on every install, although the recognition service
// only runs with `--profile scan`, and every failure blamed the photo. The API
// now says whether the service is up, and why a scan failed.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { analyzeLabelImage, isScanAvailable, OcrError, resetScanAvailabilityCache } from '../../src/services/ocr.service';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  fetchMock.mockReset();
  resetScanAvailabilityCache();
});

describe('isScanAvailable', () => {
  it('is true when the service lists the moondream model', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ models: [{ name: 'moondream:latest' }] }));
    await expect(isScanAvailable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('http://ollama:11434/api/tags', expect.anything());
  });

  it('is false while the model is still being pulled', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ models: [] }));
    await expect(isScanAvailable()).resolves.toBe(false);
  });

  it('is false for a different model that only shares a prefix', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ models: [{ name: 'moondream2-custom:latest' }] }));
    await expect(isScanAvailable()).resolves.toBe(false);
  });

  it('is false when the service is not running (standard install)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(isScanAvailable()).resolves.toBe(false);
  });

  it('is false when the service answers with an error', async () => {
    fetchMock.mockResolvedValue(new Response('bad gateway', { status: 502 }));
    await expect(isScanAvailable()).resolves.toBe(false);
  });

  it('asks the service once for repeated checks', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ models: [{ name: 'moondream:latest' }] }));
    await isScanAvailable();
    await isScanAvailable();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('analyzeLabelImage failure causes', () => {
  async function failureCode(): Promise<string> {
    const error = await analyzeLabelImage('aGVsbG8=').then(
      () => { throw new Error('expected a failure'); },
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(OcrError);
    return (error as OcrError).code;
  }

  it('reports SCAN_UNAVAILABLE when the service cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(failureCode()).resolves.toBe('SCAN_UNAVAILABLE');
  });

  it('reports SCAN_UNAVAILABLE when the model is not pulled (404)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'model "moondream" not found' }, 404));
    await expect(failureCode()).resolves.toBe('SCAN_UNAVAILABLE');
  });

  it('reports SCAN_FAILED for any other error answer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    await expect(failureCode()).resolves.toBe('SCAN_FAILED');
  });

  it('forgets a cached "available" once the service is found gone', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ models: [{ name: 'moondream:latest' }] }));
    await expect(isScanAvailable()).resolves.toBe(true);

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await failureCode();

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(isScanAvailable()).resolves.toBe(false);
  });

  it('still returns the extracted fields when the model answers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ response: '{"name":"Margaux","producer":"Château Margaux"}' }));
    await expect(analyzeLabelImage('aGVsbG8=')).resolves.toEqual({ name: 'Margaux', producer: 'Château Margaux' });
  });
});
