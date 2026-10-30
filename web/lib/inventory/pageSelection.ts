/**
 * The list view's table reports its selection for the page it shows: either
 * "all" or the set of row keys ticked. Bulk selection spans pages, so this
 * folds that report into the selection kept for every page: what the page
 * reports replaces the page's own ids, ids from other pages stay as they are.
 */
export function mergePageSelection(
  previous: ReadonlySet<string>,
  pageIds: readonly string[],
  pageSelection: 'all' | Iterable<string | number>,
): Set<string> {
  const next = new Set(previous);
  pageIds.forEach((id) => next.delete(id));
  if (pageSelection === 'all') {
    pageIds.forEach((id) => next.add(id));
    return next;
  }
  const onPage = new Set(pageIds);
  for (const key of pageSelection) {
    const id = String(key);
    if (onPage.has(id)) next.add(id);
  }
  return next;
}
