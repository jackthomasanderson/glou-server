import { describe, it, expect } from 'vitest';
import { mergePageSelection } from './pageSelection';

// #705: the list view's table reports the selection of the page it shows;
// the bulk selection spans every page.
describe('mergePageSelection', () => {
  const page = ['a', 'b', 'c'];

  it('adds a row ticked on the page', () => {
    expect(mergePageSelection(new Set(), page, new Set(['b']))).toEqual(new Set(['b']));
  });

  it('removes a row unticked on the page', () => {
    expect(mergePageSelection(new Set(['a', 'b']), page, new Set(['a']))).toEqual(new Set(['a']));
  });

  it('keeps what was selected on other pages', () => {
    expect(mergePageSelection(new Set(['x', 'a']), page, new Set(['x', 'c']))).toEqual(new Set(['x', 'c']));
    // Unticking every row of the page leaves the other pages alone.
    expect(mergePageSelection(new Set(['x', 'a', 'b']), page, new Set())).toEqual(new Set(['x']));
  });

  it('selects the whole page, and only it, on "all"', () => {
    expect(mergePageSelection(new Set(['x']), page, 'all')).toEqual(new Set(['x', 'a', 'b', 'c']));
  });

  it('ignores keys that are not on the page', () => {
    expect(mergePageSelection(new Set(), page, new Set(['gone', 'a']))).toEqual(new Set(['a']));
  });

  it('returns the reported set itself, so its shift-click anchor survives', () => {
    // Stands in for the table's selection set, which carries the range anchor.
    class AnchoredSet extends Set<string | number> {
      anchorKey: string | null = 'a';
    }
    const reported = new AnchoredSet(['a', 'b']);
    const result = mergePageSelection(new Set(['x']), page, reported);
    expect(result).toBe(reported);
    expect((result as unknown as AnchoredSet).anchorKey).toBe('a');
    // Contents only: toEqual would also compare the subclass and its anchor.
    expect([...result].sort()).toEqual(['a', 'b', 'x']);
  });

  it('does not modify the previous selection', () => {
    const previous = new Set(['a']);
    mergePageSelection(previous, page, new Set(['b']));
    expect(previous).toEqual(new Set(['a']));
  });
});
