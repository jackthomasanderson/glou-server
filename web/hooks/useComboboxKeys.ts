import React, { useState } from 'react';

/**
 * Keyboard model of a WAI-ARIA combobox with a listbox popup: focus stays in
 * the input, arrows move a virtual cursor (`aria-activedescendant`), Enter
 * picks, Escape closes (#198, #357). Rows only react to `click`, never to
 * `mousedown` alone, so Enter and assistive technologies work too.
 */
export function useComboboxKeys<T>(
  options: T[],
  opts: { isOpen: boolean; open: () => void; dismiss: () => void; pick: (o: T) => void },
) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const { isOpen, open, dismiss, pick } = opts;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const count = options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) open();
        if (count) setActiveIndex((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) open();
        if (count) setActiveIndex((i) => (i <= 0 ? count - 1 : i - 1));
        break;
      case 'Home':
        if (isOpen && count) { e.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (isOpen && count) { e.preventDefault(); setActiveIndex(count - 1); }
        break;
      case 'Enter':
        if (isOpen && activeIndex >= 0 && options[activeIndex]) {
          e.preventDefault();
          pick(options[activeIndex]);
        }
        break;
      case 'Escape':
        if (isOpen && count) { e.preventDefault(); e.stopPropagation(); setActiveIndex(-1); dismiss(); }
        break;
    }
  };

  return { activeIndex, setActiveIndex, resetActive: () => setActiveIndex(-1), onKeyDown };
}

export function optionDomId(listId: string, index: number) {
  return `${listId}-option-${index}`;
}
