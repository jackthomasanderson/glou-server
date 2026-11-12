'use client';
import { useRef } from 'react';
import { Select, type SelectProps, type SharedSelection } from '@heroui/react';
import { ACCESSIBLE_POPOVER } from './accessiblePopover';

type Keys = SelectProps['selectedKeys'];

function firstKey(keys: Keys | SharedSelection | undefined): string | undefined {
  if (keys == null || keys === 'all') return undefined;
  const [key] = Array.from(keys as Iterable<unknown>);
  return key == null ? undefined : String(key);
}

/**
 * A single-choice menu that always keeps a choice, and closes on any click
 * on an option — the one already chosen included.
 *
 * Recette n°5 of #847: HeroUI lets the chosen option be clicked again to
 * unselect it, and « Ajouter des bouteilles » saved the bottles "Sans cave";
 * `disallowEmptySelection` keeps the choice. Recette n°5 bis: then that click
 * no longer closed the list (HeroUI closes it on a change of selection only),
 * so `allowDuplicateSelectionEvents` makes it one — but not for the page: the
 * same choice again is not passed on (no saving of an unchanged preference).
 */
export function SingleSelect<T extends object>({ onSelectionChange, selectedKeys, defaultSelectedKeys, popoverProps, ...props }: SelectProps<T>) {
  const chosen = useRef(firstKey(defaultSelectedKeys));
  const handle = (keys: SharedSelection) => {
    const key = firstKey(keys);
    const current = selectedKeys !== undefined ? firstKey(selectedKeys) : chosen.current;
    if (key === current) return;
    chosen.current = key;
    onSelectionChange?.(keys);
  };
  return (
    <Select<T>
      {...props}
      selectedKeys={selectedKeys}
      defaultSelectedKeys={defaultSelectedKeys}
      disallowEmptySelection
      {...{ allowDuplicateSelectionEvents: true }}
      onSelectionChange={handle}
      // #729: the list stays readable by screen readers inside a dialog.
      popoverProps={{ ...ACCESSIBLE_POPOVER, ...popoverProps }}
    />
  );
}
