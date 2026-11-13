import { describe, it, expect, vi, afterEach } from 'vitest';
import { guestClient, GuestRequestError } from '../client';

// #619: a guest opening a share link went through a fetch of its own, with
// no deadline: over a connection that never answers the page spun forever.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('guest pages', () => {
  it('give up on a link that never answers', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), 10);
      return controller.signal;
    });
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })));
    await expect(guestClient.getMeta('tok')).rejects.toMatchObject({ name: 'TimeoutError' });
    await expect(guestClient.getInventory('tok')).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('keep the status of a refusal, to tell a dead link from an outage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'SHARE_EXPIRED' }), { status: 410 })));
    const err = await guestClient.getMeta('tok').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GuestRequestError);
    expect(err).toMatchObject({ message: 'SHARE_EXPIRED', status: 410 });
  });

  it('read a proxy 502 page as NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(guestClient.createTasting('tok', { productId: 'p1' } as never)).rejects.toMatchObject({ message: 'NETWORK_ERROR', status: 502 });
  });
});
