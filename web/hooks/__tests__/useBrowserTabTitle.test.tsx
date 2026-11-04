import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NEUTRAL_TAB_TITLE, useBrowserTabTitle } from '../useBrowserTabTitle';

// #471 (recette v2): the server title is the neutral « Glou »; the page's
// own label, in the member's language, goes in front once known.
describe('useBrowserTabTitle', () => {
  it('puts the translated label in front of the app name', () => {
    renderHook(() => useBrowserTabTitle('Caves'));
    expect(document.title).toBe('Caves — Glou');
  });

  it('a page without a label goes back to the neutral title, not the previous page\'s', () => {
    const { rerender } = renderHook(({ label }: { label?: string }) => useBrowserTabTitle(label), { initialProps: { label: 'Caves' as string | undefined } });
    rerender({ label: undefined });
    expect(document.title).toBe(NEUTRAL_TAB_TITLE);
    expect(NEUTRAL_TAB_TITLE).toBe('Glou');
  });
});
