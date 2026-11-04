import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueuedMutation } from './db';

// Review of #823 (N4): taking a change for sending and dropping it must each
// be ONE IndexedDB transaction — a check then a write in two steps let
// « Annuler » drop a change the replay was about to send. No IndexedDB in
// jsdom and no fake-indexeddb in the dependencies: `idb` is stood in for by
// a store that records which transaction every read and write belongs to.

const { rows, log } = vi.hoisted(() => ({
  rows: new Map<string, QueuedMutation>(),
  log: [] as Array<{ tx: number; op: string }>,
}));

vi.mock('idb', () => {
  let txCount = 0;
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      txCount += 1;
      const tx = txCount;
      return {
        store: {
          get: async (id: string) => { log.push({ tx, op: 'get' }); return rows.get(id); },
          put: async (row: QueuedMutation) => { log.push({ tx, op: 'put' }); rows.set(row.id, row); },
          delete: async (id: string) => { log.push({ tx, op: 'delete' }); rows.delete(id); },
        },
        done: Promise.resolve(),
      };
    },
    // Outside a transaction: never used by the two functions under test.
    get: async () => { log.push({ tx: 0, op: 'get' }); },
    put: async () => { log.push({ tx: 0, op: 'put' }); },
    delete: async () => { log.push({ tx: 0, op: 'delete' }); },
  };
  return { openDB: async () => db };
});

import { claimQueuedMutation, takeQueuedMutationUnlessSyncing } from './db';

const change = (status: QueuedMutation['status']): QueuedMutation =>
  ({ id: 'm1', itemId: 'g', patch: {}, expectedUpdatedAt: 'v1', createdAt: 't1', status });

beforeEach(() => {
  rows.clear();
  log.length = 0;
});

describe('claimQueuedMutation', () => {
  it('marks a pending change syncing, reading and writing in one transaction', async () => {
    rows.set('m1', change('pending'));
    expect(await claimQueuedMutation('m1')).toMatchObject({ id: 'm1', status: 'syncing' });
    expect(rows.get('m1')?.status).toBe('syncing');
    expect(log.map((e) => e.op)).toEqual(['get', 'put']);
    expect(new Set(log.map((e) => e.tx)).size).toBe(1);
    expect(log[0].tx).not.toBe(0);
  });

  it('takes nothing that is gone or not pending', async () => {
    expect(await claimQueuedMutation('m1')).toBeUndefined();
    rows.set('m1', change('conflict'));
    expect(await claimQueuedMutation('m1')).toBeUndefined();
    expect(rows.get('m1')?.status).toBe('conflict');
    expect(log.some((e) => e.op === 'put')).toBe(false);
  });
});

describe('takeQueuedMutationUnlessSyncing', () => {
  it('drops a change not being sent, checking and deleting in one transaction', async () => {
    rows.set('m1', change('pending'));
    expect(await takeQueuedMutationUnlessSyncing('m1')).toMatchObject({ id: 'm1' });
    expect(rows.has('m1')).toBe(false);
    expect(log.map((e) => e.op)).toEqual(['get', 'delete']);
    expect(new Set(log.map((e) => e.tx)).size).toBe(1);
  });

  it('leaves a change being sent', async () => {
    rows.set('m1', change('syncing'));
    expect(await takeQueuedMutationUnlessSyncing('m1')).toBeUndefined();
    expect(rows.has('m1')).toBe(true);
    expect(log.some((e) => e.op === 'delete')).toBe(false);
  });
});
