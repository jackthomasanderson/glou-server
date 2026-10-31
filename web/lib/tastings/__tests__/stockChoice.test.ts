import { describe, it, expect, vi } from 'vitest';
import { applyStockChoice, smokeOutcome, stockChoicesFor, stockPatchFor, type TastedItemStock } from '../stockChoice';

const closedBottle: TastedItemStock = { category: 'wine', isOpened: false };
const openedBottle: TastedItemStock = { category: 'wine', isOpened: true, fillLevel: 20 };
const finishedBottle: TastedItemStock = { category: 'wine', isOpened: true, fillLevel: 0 };
// #471 (FEAT-95): N closed boxes of M cigars, one opened box, N single cigars.
const closedBoxes = (quantity: number, cigarsPerBox = 25): TastedItemStock =>
  ({ category: 'cigar', isOpened: false, quantity, cigarsPerBox, cigarsLeft: null });
const openedBox = (cigarsLeft: number): TastedItemStock =>
  ({ category: 'cigar', isOpened: true, fillLevel: null, quantity: 1, cigarsPerBox: 25, cigarsLeft });
const singles = (quantity: number): TastedItemStock =>
  ({ category: 'cigar', isOpened: false, quantity, cigarsPerBox: null, cigarsLeft: null });
const smokedCigar: TastedItemStock = { category: 'cigar', isOpened: true, fillLevel: 0, quantity: 1, cigarsPerBox: null, cigarsLeft: 0 };
const cigarBox = closedBoxes;

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

  // An unknown item may be an opened bottle or a cigar box: no guess.
  it('updates nothing when the tasted item is unknown', () => {
    expect(stockPatchFor('opened', undefined)).toBeNull();
    expect(stockPatchFor('consumed', undefined)).toBeNull();
    expect(stockPatchFor('smokeOne', undefined)).toBeNull();
  });

  // #595: an opened bottle at 20 % went back to 50 %, opened today.
  it('never touches the level nor the opening date of an already opened bottle', () => {
    expect(stockPatchFor('opened', openedBottle)).toBeNull();
  });

  // #586, #471 (K): one smoked cigar is never the whole box emptied, and
  // never `quantity − 1` (a correction of the number): the API smokes it.
  it('smokes exactly one cigar, whatever holds it', () => {
    for (const item of [closedBoxes(3), closedBoxes(1), openedBox(10), openedBox(1), singles(4), singles(1)]) {
      expect(stockPatchFor('smokeOne', item)).toEqual({ smokeOne: true });
    }
  });

  it('never empties nor opens a cigar box', () => {
    expect(stockPatchFor('consumed', cigarBox(25))).toBeNull();
    expect(stockPatchFor('opened', cigarBox(25))).toBeNull();
  });

  it('smokes nothing once there is no cigar left', () => {
    expect(stockPatchFor('smokeOne', smokedCigar)).toBeNull();
    expect(stockPatchFor('smokeOne', { ...singles(2), writtenOffAt: '2026-10-01T00:00:00.000Z' })).toBeNull();
  });

  it('smokes cigars only', () => {
    expect(stockPatchFor('smokeOne', closedBottle)).toBeNull();
  });
});

// FEAT-95 / ux-ui.md §10.4.3: what smoking one does to the line, for its label.
describe('smokeOutcome', () => {
  it('opens a closed box: M − 1 left in it', () => {
    expect(smokeOutcome(closedBoxes(3, 25))).toEqual({ kind: 'opensBox', left: 24 });
  });

  // Review #807: the API finishes a closed box of one cigar at once.
  it('a closed box of a single cigar is smoked through, never "opened, 0 left"', () => {
    expect(smokeOutcome(closedBoxes(2, 1))).toEqual({ kind: 'fromBox', left: 0 });
  });

  it('takes one out of an opened box', () => {
    expect(smokeOutcome(openedBox(10))).toEqual({ kind: 'fromBox', left: 9 });
    expect(smokeOutcome(openedBox(1))).toEqual({ kind: 'fromBox', left: 0 });
  });

  it('takes one single cigar: N − 1 left', () => {
    expect(smokeOutcome(singles(4))).toEqual({ kind: 'single', left: 3 });
  });

  it('has nothing to say of a bottle or of nothing left', () => {
    expect(smokeOutcome(closedBottle)).toBeNull();
    expect(smokeOutcome(smokedCigar)).toBeNull();
  });
});

describe('stockChoicesFor', () => {
  it('offers "opened" and "consumed" for a closed bottle', () => {
    expect(stockChoicesFor(closedBottle)).toEqual(['opened', 'consumed']);
  });

  it('has nothing to ask when the tasted item is unknown', () => {
    expect(stockChoicesFor(undefined)).toEqual([]);
  });

  it('has nothing to ask for a finished bottle', () => {
    expect(stockChoicesFor(finishedBottle)).toEqual([]);
    expect(stockPatchFor('consumed', finishedBottle)).toBeNull();
  });

  it('offers only "consumed" for an already opened bottle (#595)', () => {
    expect(stockChoicesFor(openedBottle)).toEqual(['consumed']);
  });

  it('offers only "smoke one" for cigars in stock (#586)', () => {
    expect(stockChoicesFor(cigarBox(25))).toEqual(['smokeOne']);
    expect(stockChoicesFor(openedBox(3))).toEqual(['smokeOne']);
    expect(stockChoicesFor(singles(1))).toEqual(['smokeOne']);
  });

  it('has nothing to ask for a cigar already smoked', () => {
    expect(stockChoicesFor(smokedCigar)).toEqual([]);
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

  it('asks the API to smoke one cigar', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    await expect(applyStockChoice('smokeOne', cigarBox(25), update, vi.fn())).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ smokeOne: true });
  });

  it('sends nothing for "opened" on an already opened bottle', async () => {
    const update = vi.fn();
    await expect(applyStockChoice('opened', openedBottle, update, vi.fn())).resolves.toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('reports the failure and keeps the dialog open when the update rejects', async () => {
    const boom = new Error('boom');
    const update = vi.fn().mockRejectedValue(boom);
    const onError = vi.fn();
    await expect(applyStockChoice('opened', closedBottle, update, onError)).resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith(boom);
  });
});
