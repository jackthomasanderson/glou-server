import { describe, it, expect, vi } from 'vitest';
import { applyStockChoice, stockChoicesFor, stockPatchFor, type TastedItemStock } from '../stockChoice';

const closedBottle: TastedItemStock = { category: 'wine', isOpened: false };
const openedBottle: TastedItemStock = { category: 'wine', isOpened: true };
const cigarBox = (quantity: number | null): TastedItemStock => ({ category: 'cigar', isOpened: false, quantity });

describe('stockPatchFor', () => {
  it('leaves the stock alone on "ignore"', () => {
    expect(stockPatchFor('ignore', closedBottle)).toBeNull();
    expect(stockPatchFor('ignore', cigarBox(25))).toBeNull();
  });

  it('empties a consumed bottle', () => {
    expect(stockPatchFor('consumed', closedBottle)).toEqual({ isOpened: true, fillLevel: 0 });
    expect(stockPatchFor('consumed', openedBottle)).toEqual({ isOpened: true, fillLevel: 0 });
  });

  it('marks a closed bottle opened, half full, opened today', () => {
    const now = new Date('2026-10-05T10:00:00.000Z');
    expect(stockPatchFor('opened', closedBottle, now)).toEqual({
      isOpened: true,
      fillLevel: 50,
      openedAt: '2026-10-05T10:00:00.000Z',
    });
  });

  it('keeps the closed-bottle behaviour when the tasted item is unknown', () => {
    const now = new Date('2026-10-05T10:00:00.000Z');
    expect(stockPatchFor('opened', undefined, now)).toEqual({
      isOpened: true,
      fillLevel: 50,
      openedAt: '2026-10-05T10:00:00.000Z',
    });
  });

  // #595: an opened bottle at 20 % went back to 50 %, opened today.
  it('never touches the level nor the opening date of an already opened bottle', () => {
    expect(stockPatchFor('opened', openedBottle)).toBeNull();
  });

  // #586: one smoked cigar emptied the whole box.
  it('removes exactly one cigar from a box', () => {
    expect(stockPatchFor('removeOneCigar', cigarBox(25))).toEqual({ quantity: 24 });
    expect(stockPatchFor('removeOneCigar', cigarBox(1))).toEqual({ quantity: 0 });
  });

  it('never empties nor opens a cigar box', () => {
    expect(stockPatchFor('consumed', cigarBox(25))).toBeNull();
    expect(stockPatchFor('opened', cigarBox(25))).toBeNull();
  });

  it('removes nothing from an empty box', () => {
    expect(stockPatchFor('removeOneCigar', cigarBox(0))).toBeNull();
    expect(stockPatchFor('removeOneCigar', cigarBox(null))).toBeNull();
  });

  it('removes cigars from cigar boxes only', () => {
    expect(stockPatchFor('removeOneCigar', closedBottle)).toBeNull();
  });
});

describe('stockChoicesFor', () => {
  it('offers "opened" and "consumed" for a closed bottle', () => {
    expect(stockChoicesFor(closedBottle)).toEqual(['opened', 'consumed']);
    expect(stockChoicesFor(undefined)).toEqual(['opened', 'consumed']);
  });

  it('offers only "consumed" for an already opened bottle (#595)', () => {
    expect(stockChoicesFor(openedBottle)).toEqual(['consumed']);
  });

  it('offers only "one cigar less" for a box with cigars left (#586)', () => {
    expect(stockChoicesFor(cigarBox(25))).toEqual(['removeOneCigar']);
  });

  it('has nothing to ask for an empty box', () => {
    expect(stockChoicesFor(cigarBox(0))).toEqual([]);
    expect(stockChoicesFor(cigarBox(null))).toEqual([]);
  });
});

describe('applyStockChoice (#196)', () => {
  it('lets the dialog close without calling the API on "ignore"', async () => {
    const update = vi.fn();
    const onError = vi.fn();
    await expect(applyStockChoice('ignore', closedBottle, update, onError)).resolves.toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('lets the dialog close after a successful update', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    await expect(applyStockChoice('consumed', closedBottle, update, onError)).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ isOpened: true, fillLevel: 0 });
    expect(onError).not.toHaveBeenCalled();
  });

  it('sends one cigar less for a cigar box', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    await expect(applyStockChoice('removeOneCigar', cigarBox(25), update, vi.fn())).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ quantity: 24 });
  });

  it('sends nothing for "opened" on an already opened bottle', async () => {
    const update = vi.fn();
    await expect(applyStockChoice('opened', openedBottle, update, vi.fn())).resolves.toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('reports the failure and keeps the dialog open when the update rejects', async () => {
    const update = vi.fn().mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    await expect(applyStockChoice('opened', closedBottle, update, onError)).resolves.toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
