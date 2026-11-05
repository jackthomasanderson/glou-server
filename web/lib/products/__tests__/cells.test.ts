import { beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  cellAnswer, cellAskOf, cellChoiceFor, cellsToName, cellsToNameOf, preselectedCell, slotSummary, UNPLACED,
} from '../cells';
import { openedBottle, unit } from './factories';
import { frenchT } from './i18n';

// FEAT-93 (#847, lot S4): the cells of a line as the drawer says and asks them.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const cells = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `s${index + 1}`, column: index + 1, row: 1 }));

describe('slotSummary — "4 rangées, 2 non rangées · C1·R1, …"', () => {
  it('c1: a group ×6 in 6 cells says "6 rangées" and where', () => {
    expect(slotSummary(unit({ quantity: 6, slots: cells(6) }), 'bottle', t))
      .toBe('6 rangées · C1·R1, C2·R1, C3·R1, C4·R1, C5·R1, C6·R1');
  });

  it('c2: 2 of 6 placed says the others too', () => {
    expect(slotSummary(unit({ quantity: 6, slots: cells(2) }), 'bottle', t)).toBe('2 rangées, 4 non rangées · C1·R1, C2·R1');
    expect(slotSummary(unit({ quantity: 2, slots: cells(1) }), 'bottle', t)).toBe('1 rangée, 1 non rangée · C1·R1');
  });

  it('nothing when no copy is placed in a cellar without a plan (no noise)', () => {
    expect(slotSummary(unit({ quantity: 6, slots: [] }), 'bottle', t)).toBeNull();
  });

  it('in a cellar with a plan, a line without any cell says its copies are unplaced, like the others (recette n°5 of #847)', () => {
    expect(slotSummary(unit({ quantity: 1, slots: [] }), 'bottle', t, true)).toBe('1 non rangée');
    expect(slotSummary(unit({ quantity: 6, slots: [] }), 'bottle', t, true)).toBe('6 non rangées');
    expect(slotSummary(openedBottle(40, { slots: [] }), 'bottle', t, true)).toBe('1 non rangée');
    expect(slotSummary(unit({ quantity: 2, cigarsPerBox: 25, slots: [] }), 'cigar', t, true)).toBe('2 non rangées');
    expect(slotSummary(unit({ quantity: 10, cigarsPerBox: null, slots: [] }), 'cigar', t, true)).toBe('Non rangés');
  });

  it('an opened bottle in its cell; a group of single cigars in its one cell', () => {
    expect(slotSummary(openedBottle(40, { slots: cells(1) }), 'bottle', t)).toBe('1 rangée · C1·R1');
    expect(slotSummary(unit({ quantity: 10, cigarsPerBox: null, slots: cells(1) }), 'cigar', t)).toBe('Rangés en C1·R1');
    expect(slotSummary(unit({ quantity: 3, cigarsPerBox: 25, slots: cells(1) }), 'cigar', t)).toBe('1 rangée, 2 non rangées · C1·R1');
  });
});

describe('cellChoiceFor — "De quelle case ?" only when it matters (plan §4)', () => {
  it.each([
    ['q=3, s=1', 3, 1, { unplaced: 2 }],
    ['q=2, s=2', 2, 2, { unplaced: 0 }],
  ])('%s: asked, with the cells and the copies unplaced', (_label, quantity, placed, expected) => {
    expect(cellChoiceFor(unit({ quantity, slots: cells(placed) }), 'bottle')).toEqual({ slots: cells(placed), ...expected });
  });

  it('never for a line of one, a line without a cell, an opened bottle or a group of single cigars', () => {
    expect(cellChoiceFor(unit({ quantity: 1, slots: cells(1) }), 'bottle')).toBeNull();
    expect(cellChoiceFor(unit({ quantity: 6, slots: [] }), 'bottle')).toBeNull();
    expect(cellChoiceFor(openedBottle(40, { slots: cells(1) }), 'bottle')).toBeNull();
    expect(cellChoiceFor(unit({ quantity: 10, cigarsPerBox: null, slots: cells(1) }), 'cigar')).toBeNull();
    // Boxes, like bottles, each their own cell: asked.
    expect(cellChoiceFor(unit({ quantity: 3, cigarsPerBox: 25, slots: cells(1) }), 'cigar')).not.toBeNull();
  });

  it('decision 76: "Non rangée" preselected while one is left, else nothing', () => {
    expect(preselectedCell({ slots: cells(1), unplaced: 2 })).toBe(UNPLACED);
    expect(preselectedCell({ slots: cells(2), unplaced: 0 })).toBeNull();
    expect(cellAnswer(UNPLACED)).toEqual({ fromUnplaced: true });
    expect(cellAnswer('s2')).toEqual({ fromSlotId: 's2' });
  });
});

describe('cellsToName — the cells a smaller line must name (c4, decision 74)', () => {
  it('c4: ×6 in 6 cells kept at 4 names 2; unplaced copies leave first', () => {
    expect(cellsToName(unit({ quantity: 6, slots: cells(6) }), 4, 'bottle')).toBe(2);
    expect(cellsToName(unit({ quantity: 6, slots: cells(5) }), 4, 'bottle')).toBe(1);
    expect(cellsToName(unit({ quantity: 6, slots: cells(4) }), 4, 'bottle')).toBe(0);
  });

  it('a line left empty frees everything without a question; single cigars keep their one cell', () => {
    expect(cellsToName(unit({ quantity: 6, slots: cells(6) }), 0, 'bottle')).toBe(0);
    expect(cellsToName(unit({ quantity: 10, cigarsPerBox: null, slots: cells(1) }), 2, 'cigar')).toBe(0);
  });
});

describe('the questions of the API (409 with details)', () => {
  it('reads "De quelle case ?" and "Quelles cases libérer ?" from the refusal', () => {
    const ask = { slots: cells(1), unplaced: 2 };
    expect(cellAskOf(new ApiError('SLOT_CHOICE_REQUIRED', 409, undefined, ask))).toEqual(ask);
    expect(cellAskOf(new ApiError('SLOT_CHANGED', 409, undefined, ask))).toEqual(ask);
    expect(cellAskOf(new ApiError('CONFLICT', 409, undefined, ask))).toBeUndefined();
    expect(cellAskOf(new ApiError('SLOT_CHOICE_REQUIRED', 409))).toBeUndefined();
    const toFree = { needed: 1, slots: cells(2) };
    expect(cellsToNameOf(new ApiError('SLOTS_TO_FREE_REQUIRED', 409, undefined, toFree))).toEqual(toFree);
    expect(cellsToNameOf(new Error('SLOTS_TO_FREE_REQUIRED'))).toBeUndefined();
  });
});
