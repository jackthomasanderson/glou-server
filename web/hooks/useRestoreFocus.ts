import { useEffect } from 'react';

/**
 * Remembers the element that had focus when a modal-like overlay mounted and
 * gives it back when the overlay unmounts (#200). Without it, closing the lock
 * screen drops focus on <body> and a keyboard user starts again from the top of
 * the page. The hand-back is deferred one tick so it runs after the content
 * behind the overlay is no longer `inert` (an inert element cannot take focus).
 */
export function useRestoreFocus(): void {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      setTimeout(() => {
        if (previous && previous !== document.body && document.contains(previous)) previous.focus();
      }, 0);
    };
  }, []);
}
