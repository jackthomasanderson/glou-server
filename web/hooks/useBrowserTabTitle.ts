'use client';
import { useEffect } from 'react';

/** The tab title of a page with no title of its own (and the server's, app/layout.tsx). */
export const NEUTRAL_TAB_TITLE = 'Glou';

// #428: Next.js metadata sets a static tab title because the server can't
// know the client-side active language. Once i18n is ready, override it
// with the active language only. #530: also used by the public pages
// (sign-in, sign-up, password reset, guest share).
// #471 (recette v2): the server title is now the neutral « Glou » on every
// page (no more bilingual « Inventory · Inventaire »), so a page without a
// label of its own goes back to it rather than keeping the previous page's.
export function useBrowserTabTitle(label: string | undefined) {
  useEffect(() => {
    document.title = label ? `${label} — ${NEUTRAL_TAB_TITLE}` : NEUTRAL_TAB_TITLE;
  }, [label]);
}
