/**
 * The list view's table reports its selection for the page it shows: either
 * "all" or the set of row keys ticked. Bulk selection spans pages, so this
 * folds that report into the selection kept for every page: what the page
 * reports replaces the page's own ids, ids from other pages stay as they are.
 *
 * A reported set is updated in place and returned, not copied: the table's
 * set carries the shift-click range anchor, which it reads back from the
 * selection it is given. A copy would lose it and shift-click would only tick
 * the clicked row.
 */
export function mergePageSelection(
  previous: ReadonlySet<string>,
  pageIds: readonly string[],
  pageSelection: 'all' | Set<string | number>,
): Set<string> {
  if (pageSelection === 'all') {
    const next = new Set(previous);
    pageIds.forEach((id) => next.add(id));
    return next;
  }
  const onPage = new Set(pageIds);
  for (const key of Array.from(pageSelection)) {
    if (!onPage.has(String(key)) && !previous.has(String(key))) pageSelection.delete(key);
  }
  previous.forEach((id) => {
    if (!onPage.has(id)) pageSelection.add(id);
  });
  // Row keys are the bottles' string ids.
  return pageSelection as Set<string>;
}
