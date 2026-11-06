import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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

  // #863: Next.js (re)writes its metadata <title> ("Glou") when that part of
  // the page hydrates, sometimes after the page's own title was set: the tab
  // then stayed "Glou" on a cellar's page.
  it('puts its title back when the framework rewrites the <title> after it', async () => {
    const { unmount } = renderHook(() => useBrowserTabTitle('Cave du bas'));
    document.querySelector('title')!.firstChild!.nodeValue = 'Glou';
    await waitFor(() => expect(document.title).toBe('Cave du bas — Glou'));
    unmount();
  });

  it('stops guarding the title once the page is gone', async () => {
    const { unmount } = renderHook(() => useBrowserTabTitle('Cave du bas'));
    unmount();
    document.title = 'Ailleurs';
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.title).toBe('Ailleurs');
  });

  it('the last page mounted owns the title, without the two fighting over it', async () => {
    const first = renderHook(() => useBrowserTabTitle('Caves'));
    const second = renderHook(() => useBrowserTabTitle('Connexion'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.title).toBe('Connexion — Glou');
    second.unmount();
    await waitFor(() => expect(document.title).toBe('Caves — Glou'));
    first.unmount();
  });

  // Review of #868: the browser trims and collapses the whitespace of
  // document.title, so a raw comparison never matched a cellar named with a
  // trailing or double space and the hook rewrote the title forever.
  it.each([['trailing space', 'Cave du bas '], ['double space', 'Cave  du bas'], ['leading tab', '\tCave du bas']])(
    'a label with a %s ends written once, as the browser shows it',
    async (_case, label) => {
      document.title = 'Glou';
      const title = document.querySelector('title')!;
      let writes = 0;
      const counter = new MutationObserver(records => { writes += records.length; });
      counter.observe(title, { childList: true, characterData: true, subtree: true });
      const { unmount } = renderHook(() => useBrowserTabTitle(label));
      await new Promise(resolve => setTimeout(resolve, 20));
      counter.disconnect();
      expect(document.title).toBe('Cave du bas — Glou');
      expect(writes).toBeLessThanOrEqual(1);
      unmount();
    },
  );
});
