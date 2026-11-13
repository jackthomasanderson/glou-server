import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, onlineManager } from '@tanstack/react-query';

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

import { notifyError } from '@/lib/toast';
import { ApiError } from './api';
import { NetworkError } from './network-error';
import { createQueryClient } from './queryClient';

beforeEach(() => vi.clearAllMocks());

// Review of #823 (N3): offline, a write that is not queued must fail at once
// (its usual message), never wait unseen to be sent hours later.
describe('createQueryClient', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('runs a mutation while the browser says it is offline, and lets it fail at once', async () => {
    onlineManager.setOnline(false);
    const client = createQueryClient();
    let calls = 0;
    const observer = new MutationObserver(client, {
      mutationFn: async () => {
        calls += 1;
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(observer.mutate()).rejects.toThrow('Failed to fetch');
    expect(calls).toBe(1);
    expect(observer.getCurrentResult().isPaused).toBe(false);
  });
});

// #616: an action that fails is always said, even when its hook forgot to.
describe('createQueryClient — shared failure message', () => {
  it('says a failed action that has no message of its own', async () => {
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: async () => { throw new Error('HTTP 500'); },
    });
    await expect(observer.mutate()).rejects.toThrow('HTTP 500');
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith('status.error');
  });

  it('says the server could not be reached when no answer came back', async () => {
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: async () => { throw new NetworkError(new TypeError('Failed to fetch')); },
    });
    await expect(observer.mutate()).rejects.toThrow();
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith('status.serverUnreachable');
  });

  // #619: a deadline passed, or a proxy's error page, is the same "cannot reach the server".
  it.each([
    ['a timeout', new DOMException('The operation timed out.', 'TimeoutError')],
    ['a proxy error page', new ApiError('NETWORK_ERROR', 502)],
  ])('says the server could not be reached after %s', async (_label, error) => {
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: async () => { throw error; },
    });
    await expect(observer.mutate()).rejects.toBe(error);
    expect(notifyError).toHaveBeenCalledWith('status.serverUnreachable');
  });

  // #467: the database is restarting: the server answered, nothing is lost, retry soon.
  it.each([
    ['the API', new ApiError('DATABASE_UNAVAILABLE', 503)],
    ['a proxy', new ApiError('HTTP 503', 503)],
  ])('says the server is temporarily unavailable on a 503 from %s', async (_label, error) => {
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: async () => { throw error; },
    });
    await expect(observer.mutate()).rejects.toBe(error);
    expect(notifyError).toHaveBeenCalledWith('status.serverUnavailable');
  });

  it('stays silent for an action that says its own failure (meta.handlesError)', async () => {
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: async () => { throw new Error('HTTP 500'); },
      meta: { handlesError: true },
    });
    await expect(observer.mutate()).rejects.toThrow('HTTP 500');
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('says nothing when the action succeeds (a change kept in the offline queue resolves)', async () => {
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: async () => ({ queued: true }),
    });
    await observer.mutate();
    expect(notifyError).not.toHaveBeenCalled();
  });
});
