'use client';

import React from 'react';
import { Chip } from '@heroui/react';

interface FilterChipProps {
  selected: boolean;
  onPress: () => void;
  startContent?: React.ReactNode;
  radius?: 'sm' | 'md' | 'lg' | 'full';
  size?: 'sm' | 'md' | 'lg';
  /** Colour when selected (category chips use their own colour, #516). */
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
}

/** Toggle chip rendered as a real button (keyboard focusable, announces its pressed state). */
export function FilterChip({ selected, onPress, startContent, radius, size = 'sm', color = 'primary', children }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPress}
      className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Chip
        size={size}
        radius={radius}
        startContent={startContent}
        variant={selected ? 'solid' : 'bordered'}
        color={selected ? color : 'default'}
        className="cursor-pointer text-xs"
      >
        {children}
      </Chip>
    </button>
  );
}

interface FilterOptionProps {
  selected: boolean;
  onPress: () => void;
  /** 'radio' for single-choice lists (wrap in FilterOptionGroup), 'toggle' for multi-select. */
  mode?: 'radio' | 'toggle';
  children: React.ReactNode;
}

/** Option row rendered as a real button with an exposed selected state. */
export function FilterOption({ selected, onPress, mode = 'radio', children }: FilterOptionProps) {
  const a11y = mode === 'radio'
    ? ({ role: 'radio', 'aria-checked': selected } as const)
    : ({ 'aria-pressed': selected } as const);
  return (
    <button
      type="button"
      {...a11y}
      onClick={onPress}
      className={`w-full text-left px-2 py-1.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors focus-visible:outline-2 focus-visible:outline-primary ${selected ? 'bg-default-100' : 'hover:bg-default-50'}`}
    >
      <span className={`text-xs flex items-center gap-1 ${selected ? 'font-semibold' : 'font-normal'}`}>
        {children}
      </span>
      {selected && <span aria-hidden="true" className="text-xs text-primary font-bold">✓</span>}
    </button>
  );
}

export function FilterOptionGroup({ label, radio = true, children }: { label?: string; radio?: boolean; children: React.ReactNode }) {
  return (
    <div role={radio ? 'radiogroup' : 'group'} aria-label={label} className="flex flex-col gap-0.5">
      {children}
    </div>
  );
}
