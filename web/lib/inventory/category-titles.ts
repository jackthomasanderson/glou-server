/**
 * ISSUE_434 / #503: translation key of the title of each category navigation
 * shortcut (`/bottles?category=…`). The breadcrumb, the browser tab and the
 * page heading all read it, so they cannot disagree.
 */
export const CATEGORY_TITLES: Record<string, string> = {
  wine: 'nav.wines',
  sparkling: 'nav.sparkling',
  spirit: 'nav.spirits',
};
