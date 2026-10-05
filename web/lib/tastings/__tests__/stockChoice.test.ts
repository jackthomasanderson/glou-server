import { describe, it, expect, vi } from 'vitest';
import { applyStockChoice, stockPatchFor } from '../stockChoice';

describe('stockPatchFor', () => {
  it('leaves the stock alone on "ignore"', () => {
    expect(stockPatchFor('ignore')).toBeNull();
  });

  it('empties a consumed bottle', () => {
    expect(stockPatchFor('consumed')).toEqual({ isOpened: true, fillLevel: 0 });
  });

  it('marks an opened bottle half full with the opening date', () => {
    const now = new Date('2026-10-05T10:00:00.000Z');
    expect(stockPatchFor('opened', now)).toEqual({
      isOpened: true,
      fillLevel: 50,
      openedAt: '2026-10-05T10:00:00.000Z',
    });
  });
});

describe('applyStockChoice (#196)', () => {
  it('lets the dialog close without calling the API on "ignore"', async () => {
    const update = vi.fn();
    const onError = vi.fn();
    await expect(applyStockChoice('ignore', update, onError)).resolves.toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('lets the dialog close after a successful update', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    await expect(applyStockChoice('consumed', update, onError)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ isOpened: true, fillLevel: 0 });
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports the failure and keeps the dialog open when the update rejects', async () => {
    const update = vi.fn().mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    await expect(applyStockChoice('opened', update, onError)).resolves.toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
