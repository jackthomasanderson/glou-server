import { useEffect, useRef } from 'react';

/**
 * Makes a hand-rolled drawer behave like the modal dialog it declares itself
 * to be (#358): while `open`, focus moves into the panel, everything outside
 * it becomes `inert` (the same mechanism AuthGuard uses for the lock screen),
 * and focus goes back to the opener on close.
 *
 * Attach `overlayRef` to the fixed container and `panelRef` to the element
 * carrying `role="dialog"` (give it `tabIndex={-1}`). The overlay may live
 * anywhere in the tree: the siblings of every ancestor are made inert, so no
 * portal is needed.
 */
export function useModalDrawer(open: boolean) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!open || !overlay) return;

    const previous = document.activeElement as HTMLElement | null;
    const marked: Element[] = [];
    for (let node: Element = overlay; node.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || sibling.hasAttribute('inert')) continue;
        sibling.setAttribute('inert', '');
        marked.push(sibling);
      }
    }
    panelRef.current?.focus();

    return () => {
      marked.forEach(el => el.removeAttribute('inert'));
      // Deferred so it runs once the content behind is no longer inert.
      setTimeout(() => {
        if (previous && previous !== document.body && document.contains(previous)) previous.focus();
      }, 0);
    };
  }, [open]);

  return { overlayRef, panelRef };
}
