import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FamilyStockLines } from '../FamilyStockLines';
import { familyLines, type LineContext } from '@/lib/products/lines';
import { openedBottle, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';
import type { ProductItem } from '@/lib/products/types';

// #471 — ux-ui.md §10.3: the bottles of a wine in its drawer, line by line.

let ctx: LineContext;
beforeAll(async () => {
  ctx = {
    kind: 'bottle',
    t: await frenchT(),
    cellarName: (id) => ({ garage: 'Garage', kitchen: 'Cuisine' } as Record<string, string>)[id],
    formatPrice: (value) => `${value} €`,
    formatDay: (day) => day,
    formatDate: (iso) => iso.slice(0, 10),
  };
});

const draw = (items: ProductItem[], props: Partial<React.ComponentProps<typeof FamilyStockLines>> = {}) =>
  render(<FamilyStockLines lines={familyLines(items, ctx.cellarName)} ctx={ctx} {...props} />);

const lineTexts = () => screen.getAllByTestId('family-line').map((line) => line.querySelector('p')?.textContent);

describe('FamilyStockLines', () => {
  it('lists the groups by cellar then purchase day, then the opened bottle', () => {
    draw([
      openedBottle(60, { cellarId: 'garage' }),
      unit({ quantity: 2, cellarId: 'garage', purchasePrice: 20, purchasedAt: '2026-06-01' }),
      unit({ quantity: 6, cellarId: 'garage', purchasePrice: 20, purchasedAt: '2026-01-15' }),
      unit({ quantity: 2, cellarId: 'kitchen', purchasePrice: 20, purchasedAt: '2026-01-15' }),
    ]);
    expect(lineTexts()).toEqual([
      '×2 · Cuisine · 20 € / bouteille · 2026-01-15',
      '×6 · Garage · 20 € / bouteille · 2026-01-15',
      '×2 · Garage · 20 € / bouteille · 2026-06-01',
      'Entamée · Garage · ouverte le 2026-02-01',
    ]);
  });

  it('shows five lines, the others behind "Voir les N autres"', () => {
    draw(Array.from({ length: 7 }, (_, i) => unit({ quantity: 2, purchasePrice: 10 + i })));
    expect(screen.getAllByTestId('family-line')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: /Voir les 2 autres/ }));
    expect(screen.getAllByTestId('family-line')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: /Voir moins/ }));
    expect(screen.getAllByTestId('family-line')).toHaveLength(5);
  });

  it('"Déjà bues ou parties" is folded, with its count, and unfolds to dated lines', () => {
    draw([
      unit({ quantity: 3 }),
      openedBottle(0, { cellarId: 'garage', purchasePrice: 20, updatedAt: '2026-10-12T00:00:00.000Z' }),
      unit({ quantity: 1, writtenOffAt: '2026-09-01T00:00:00.000Z' }),
    ]);
    const toggle = screen.getByRole('button', { name: /Déjà bues ou parties/ });
    expect(toggle).toHaveTextContent('1 bue · 1 cassée, offerte ou perdue');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('family-gone-lines')).toBeNull();
    fireEvent.click(toggle);
    const gone = within(screen.getByTestId('family-gone-lines')).getAllByRole('listitem').map((li) => li.textContent);
    expect(gone).toEqual(['Bue le 2026-10-12 · Garage · 20 € / bouteille', 'Cassée, offerte ou perdue le 2026-09-01 · Sans cave']);
  });

  it('only an opened bottle has a level control: never a group of full bottles', () => {
    draw([unit({ quantity: 6 }), unit({ quantity: 1 }), openedBottle(60)], { onLevelCommit: vi.fn() });
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    const opened = screen.getAllByTestId('family-line')[2];
    expect(within(opened).getByRole('slider')).toHaveValue('60');
  });

  it('the level set from the keyboard is saved for that bottle alone', () => {
    const onLevelCommit = vi.fn();
    const bottle = openedBottle(60, { id: 'sub' });
    draw([unit({ quantity: 5 }), bottle], { onLevelCommit });
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    fireEvent.keyUp(slider, { key: 'ArrowLeft' });
    expect(onLevelCommit).toHaveBeenCalledWith(bottle, 55);
  });

  it('a refused level puts the slider back on the saved level (409, 400, 500)', async () => {
    const onLevelCommit = vi.fn(() => Promise.reject(new Error('TASTINGS_ON_ITEM')));
    draw([unit({ quantity: 5 }), openedBottle(60, { id: 'sub' })], { onLevelCommit });
    fireEvent.click(screen.getByRole('button', { name: 'Pleine' }));
    expect(onLevelCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'sub' }), 100);
    await waitFor(() => expect(screen.getByRole('slider')).toHaveValue('60'));
    expect(screen.getByText('60 %')).toBeInTheDocument();
  });

  it('stays usable while saving: a level chosen meanwhile is sent next, the last one only', async () => {
    let finish: () => void = () => {};
    const onLevelCommit = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    draw([openedBottle(60, { id: 'sub' })], { onLevelCommit });
    const slider = screen.getByRole('slider');
    fireEvent.click(screen.getByRole('button', { name: 'Moitié' }));
    expect(slider).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Vide' }));
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(onLevelCommit).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(onLevelCommit).toHaveBeenCalledTimes(2);
    expect(onLevelCommit).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'sub' }), 5);
  });

  // Final review of W2 (#471, L1): back to the starting level while saving.
  it('back to the saved level while another one is saving: that level is sent next', async () => {
    let finish: () => void = () => {};
    const onLevelCommit = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    draw([openedBottle(60, { id: 'sub' })], { onLevelCommit });
    const slider = screen.getByRole('slider');
    fireEvent.click(screen.getByRole('button', { name: 'Moitié' }));
    // Back to 60 % while 50 % is saving: the bottle must end at 60 %, not 50 %.
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(screen.getByText('60 %')).toBeInTheDocument();
    await act(async () => { finish(); });
    expect(onLevelCommit).toHaveBeenCalledTimes(2);
    expect(onLevelCommit).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'sub' }), 60);
  });

  it('put back full while a level waits: the waiting level is dropped (the bottle is back with the others)', async () => {
    let finish: () => void = () => {};
    const onLevelCommit = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    draw([openedBottle(60, { id: 'sub' })], { onLevelCommit });
    fireEvent.click(screen.getByRole('button', { name: 'Pleine' }));
    fireEvent.click(screen.getByRole('button', { name: 'Moitié' }));
    await act(async () => { finish(); });
    expect(onLevelCommit).toHaveBeenCalledTimes(1);
    expect(onLevelCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'sub' }), 100);
  });

  // Review of L1: an offline opening merged into its group shows the group opened.
  it('a line of more than one bottle shown opened gets no level control', () => {
    draw([unit({ id: 'group', quantity: 6, isOpened: true, fillLevel: 100 })], { onLevelCommit: vi.fn() });
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pleine' })).toBeNull();
  });

  it('"Pleine" on a bottle just opened (100 %) still puts it back full (§10.4.6)', () => {
    const onLevelCommit = vi.fn(async () => {});
    draw([openedBottle(100, { id: 'sub' })], { onLevelCommit });
    fireEvent.click(screen.getByRole('button', { name: 'Pleine' }));
    expect(onLevelCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'sub' }), 100);
  });

  it('the shortcuts Pleine / Moitié / Vide set the level of the opened bottle', () => {
    const onLevelCommit = vi.fn(async () => {});
    draw([openedBottle(60)], { onLevelCommit });
    fireEvent.click(screen.getByRole('button', { name: 'Moitié' }));
    expect(onLevelCommit).toHaveBeenLastCalledWith(expect.anything(), 50);
  });

  it('a wine without any bottle left says so', () => {
    draw([]);
    expect(screen.getByText('Plus aucune bouteille en cave.')).toBeInTheDocument();
  });

  it('in a cellar with a plan, a line ×1 without a cell says "1 non rangée" like the others; nothing without a plan (recette n°5 of #847)', () => {
    const planned = { ...ctx, hasPlan: (id: string) => id === 'garage' };
    render(<FamilyStockLines
      lines={familyLines([
        unit({ id: 'placed', quantity: 2, cellarId: 'garage', purchasedAt: '2026-01-01', slots: [{ id: 's1', column: 1, row: 1 }] }),
        unit({ id: 'alone', quantity: 1, cellarId: 'garage', purchasedAt: '2026-02-01', slots: [] }),
        unit({ id: 'noPlan', quantity: 1, cellarId: 'kitchen', slots: [] }),
      ], ctx.cellarName)}
      ctx={planned}
    />);
    const slotsOf = (id: string) => document.querySelector(`[data-line-id="${id}"] [data-testid="line-slots"]`)?.textContent ?? null;
    expect(slotsOf('placed')).toBe('1 rangée, 1 non rangée · C1·R1');
    expect(slotsOf('alone')).toBe('1 non rangée');
    expect(slotsOf('noPlan')).toBeNull();
  });

  it('offers the line menu slot of the next lots on every line', () => {
    draw([unit({ quantity: 2 }), openedBottle(40)], { lineActions: (item) => <button type="button">menu {item.quantity}</button> });
    expect(screen.getAllByRole('button', { name: /^menu/ })).toHaveLength(2);
  });

  it('"Finir l\'entamée" leads to the opened bottle, even behind "Voir les N autres": shown and focused (FEAT-105 c2)', () => {
    const items = [...Array.from({ length: 6 }, (_, i) => unit({ quantity: 2, purchasePrice: 10 + i })), openedBottle(60, { id: 'sub' })];
    const lines = familyLines(items, ctx.cellarName);
    const { rerender } = render(<FamilyStockLines lines={lines} ctx={ctx} />);
    expect(screen.getAllByTestId('family-line')).toHaveLength(5);

    rerender(<FamilyStockLines lines={lines} ctx={ctx} focus={{ id: 'sub', nonce: 1 }} />);
    expect(screen.getAllByTestId('family-line')).toHaveLength(7);
    const opened = screen.getAllByTestId('family-line').find((line) => line.dataset.lineId === 'sub');
    expect(opened).toHaveFocus();
  });

  it('a line led to as the lines first show (a cell of the plan, FEAT-93) is shown and focused, even behind "Voir les N autres"', () => {
    const items = Array.from({ length: 7 }, (_, i) => unit({ id: `line${i}`, quantity: 2, purchasePrice: 10 + i }));
    render(<FamilyStockLines lines={familyLines(items, ctx.cellarName)} ctx={ctx} focus={{ id: 'line6', nonce: 1 }} />);
    expect(screen.getAllByTestId('family-line')).toHaveLength(7);
    expect(screen.getAllByTestId('family-line').find((line) => line.dataset.lineId === 'line6')).toHaveFocus();
  });

  it('the focus ring shows only on the line led to, and goes at blur (a plain click draws none)', () => {
    const items = [unit({ quantity: 2, purchasePrice: 10 }), openedBottle(60, { id: 'sub' })];
    const lines = familyLines(items, ctx.cellarName);
    const { rerender } = render(<FamilyStockLines lines={lines} ctx={ctx} />);
    const lineOf = (id: string) => screen.getAllByTestId('family-line').find((line) => line.dataset.lineId === id)!;
    const other = screen.getAllByTestId('family-line').find((line) => line.dataset.lineId !== 'sub')!;
    other.focus();
    expect(other.dataset.ringed).toBeUndefined();
    rerender(<FamilyStockLines lines={lines} ctx={ctx} focus={{ id: 'sub', nonce: 1 }} />);
    expect(lineOf('sub').dataset.ringed).toBe('true');
    fireEvent.blur(lineOf('sub'));
    expect(lineOf('sub').dataset.ringed).toBeUndefined();
  });

  it('a line "à vérifier" carries its mention and the review actions (§10.3)', () => {
    draw([unit({ quantity: 5, needsReview: true }), unit({ quantity: 2 })], {
      reviewActions: (item) => <button type="button">review {item.quantity}</button>,
    });
    expect(screen.getByText('À vérifier après la mise à jour')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^review/ }).map((button) => button.textContent)).toEqual(['review 5']);
  });
});

describe('FamilyStockLines — waiting for the network (FEAT-108, ux-ui.md §10.8)', () => {
  it('marks "en attente" the group changed offline and its provisional opened bottle, which has no action yet', () => {
    const lineActions = vi.fn(() => <button type="button">menu</button>);
    const onLevelCommit = vi.fn(async () => undefined);
    draw([
      unit({ id: 'g', quantity: 5, cellarId: 'garage' }),
      openedBottle(100, { id: 'offline:m1', cellarId: 'garage', parentItemId: 'g' }),
    ], { pendingIds: new Set(['g']), lineActions, onLevelCommit });

    const [group, provisional] = screen.getAllByTestId('family-line');
    // Read by screen readers as an image with its name (review of #823, N5).
    expect(within(group).getByRole('img', { name: 'Modifié hors-ligne — en attente de synchronisation' })).toBe(within(group).getByTestId('line-pending'));
    expect(within(provisional).getByTestId('line-pending')).toBeInTheDocument();
    // The group keeps its menu; the provisional bottle has no menu and no level (no id on the server yet).
    expect(lineActions).toHaveBeenCalledTimes(1);
    expect(within(provisional).queryByRole('slider')).toBeNull();
    expect(within(provisional).queryByRole('button')).toBeNull();
  });

  it('no mark without a change waiting', () => {
    draw([unit({ id: 'g', quantity: 6 })], { pendingIds: new Set() });
    expect(screen.queryByTestId('line-pending')).toBeNull();
  });
});

// FEAT-93 (#847, lot S4, plan §5): where the copies of a line are on the plan.
describe('FamilyStockLines — the cells of a line (FEAT-93)', () => {
  const cells = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `s${i}`, column: i + 1, row: 1 }));

  it('c1: a group ×6 in 6 cells says « 6 rangées » and where; c2: « 2 rangées, 4 non rangées »', () => {
    draw([
      unit({ id: 'all', quantity: 6, cellarId: 'garage', slots: cells(6) }),
      unit({ id: 'two', quantity: 6, cellarId: 'kitchen', slots: cells(2) }),
    ]);
    expect(screen.getAllByTestId('line-slots').map((line) => line.textContent)).toEqual([
      '2 rangées, 4 non rangées · C1·R1, C2·R1',
      '6 rangées · C1·R1, C2·R1, C3·R1, C4·R1, C5·R1, C6·R1',
    ]);
  });

  it('nothing on a line that holds no cell', () => {
    draw([unit({ quantity: 6, cellarId: 'garage', slots: [] })]);
    expect(screen.queryByTestId('line-slots')).toBeNull();
  });
});
