import { afterEach, describe, expect, it } from 'vitest';
import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { createQueryClient } from './queryClient';

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
