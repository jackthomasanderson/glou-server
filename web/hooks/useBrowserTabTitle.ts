'use client';
import { useEffect } from 'react';

/** The tab title of a page with no title of its own (and the server's, app/layout.tsx). */
export const NEUTRAL_TAB_TITLE = 'Glou';

// #863: Next.js renders the metadata <title> (« Glou », app/layout.tsx) in
// its own Suspense boundary, and writes it again when that boundary
// hydrates — at a moment of its choosing, sometimes after the page's effect
// below. The tab then kept « Glou » (half of the loads of a cellar's page).
// The title wanted by the page is therefore put back whenever <head>
// changes. One claim per mounted page, the last one mounted wins, so two
// pages mounted at once never fight over the title.
const claims: { title: string }[] = [];
let observer: MutationObserver | null = null;

// The browser hands document.title back with its whitespace collapsed and
// trimmed: the wanted title is normalized the same way, or a cellar named
// "Cave du bas " would never compare equal and be written again forever.
function normalizeTitle(title: string) {
  return title.replace(/[\t\n\f\r ]+/g, ' ').trim();
}

function applyClaimedTitle() {
  const wanted = claims.at(-1)?.title;
  if (wanted === undefined || document.title === wanted) return;
  document.title = wanted;
  // Drop the mutations this write itself caused: whatever the browser does
  // with the title, our own write never calls us again (no loop possible).
  observer?.takeRecords();
}

// #428: Next.js metadata sets a static tab title because the server can't
// know the client-side active language. Once i18n is ready, override it
// with the active language only. #530: also used by the public pages
// (sign-in, sign-up, password reset, guest share).
// #471 (recette v2): the server title is now the neutral « Glou » on every
// page (no more bilingual « Inventory · Inventaire »), so a page without a
// label of its own goes back to it rather than keeping the previous page's.
export function useBrowserTabTitle(label: string | undefined) {
  useEffect(() => {
    const claim = { title: normalizeTitle(label ? `${label} — ${NEUTRAL_TAB_TITLE}` : NEUTRAL_TAB_TITLE) };
    claims.push(claim);
    if (!observer) {
      observer = new MutationObserver(applyClaimedTitle);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    }
    applyClaimedTitle();
    return () => {
      claims.splice(claims.indexOf(claim), 1);
      if (claims.length === 0) {
        observer?.disconnect();
        observer = null;
      } else {
        applyClaimedTitle();
      }
    };
  }, [label]);
}
