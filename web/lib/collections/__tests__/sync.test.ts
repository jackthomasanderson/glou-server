import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));

import { notifyError } from '@/lib/toast';
import { applyCollectionChanges } from '../sync';

// #580: a save that changes several collections runs the requests in
// parallel. A refusal must be said, once, not once per failed request.

beforeEach(() => vi.clearAllMocks());

describe('applyCollectionChanges', () => {
  it('reports several failed changes with a single message, and rethrows', async () => {
    await expect(applyCollectionChanges([
      Promise.reject(new Error('COLLECTION_NOT_FOUND')),
      Promise.reject(new Error('COLLECTION_NOT_FOUND')),
      Promise.resolve(),
    ])).rejects.toThrow('COLLECTION_NOT_FOUND');

    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith('toast.collection.updateError');
  });

  it('says nothing when every change succeeds', async () => {
    await expect(applyCollectionChanges([Promise.resolve(), Promise.resolve()])).resolves.toBeUndefined();
    expect(notifyError).not.toHaveBeenCalled();
  });
});
