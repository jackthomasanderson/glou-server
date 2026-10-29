'use client';
import React, { useState } from 'react';
import { Input, InputProps } from '@heroui/react';

type ParsedInputProps<T> = Omit<InputProps, 'value' | 'onValueChange'> & {
  value: T;
  onValueChange: (value: T) => void;
  /** Text shown for a value set from outside (form reset, autocomplete). */
  format: (value: T) => string;
  parse: (text: string) => T;
};

/**
 * An input whose form value is parsed from the text (a number, a list),
 * that shows what the user typed.
 *
 * Rendering the parsed value back on every keystroke rewrote the field under
 * the cursor: "24,05" went "24,0" → "24" → "245", and "Pinot Noir, Gamay"
 * lost its spaces and commas (#706). The text is only replaced when the
 * value changes to something the text does not already stand for.
 */
export function ParsedInput<T>({ value, onValueChange, format, parse, ...props }: ParsedInputProps<T>) {
  const shown = format(value);
  const [text, setText] = useState(shown);
  // Compared as text, not by identity: `value ?? []` is a new array on
  // every render. Adjusted during render, React's pattern for derived state.
  const [prevShown, setPrevShown] = useState(shown);
  if (shown !== prevShown) {
    setPrevShown(shown);
    if (format(parse(text)) !== shown) setText(shown);
  }
  return (
    <Input
      {...props}
      value={text}
      onValueChange={(next) => {
        setText(next);
        onValueChange(parse(next));
      }}
    />
  );
}

const formatNumber = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '' : String(n));
const parseNumber = (text: string) => (text.trim() === '' ? undefined : Number(text));

type NumberInputProps = Omit<ParsedInputProps<number | null | undefined>, 'format' | 'parse' | 'onValueChange'> & {
  /** `undefined` when the field is emptied. */
  onValueChange: (value: number | undefined) => void;
};

/**
 * A `type="number"` field that keeps "24,0" or "24," while it is typed.
 * Not HeroUI's own `NumberInput`, a different component.
 */
export function ParsedNumberInput({ onValueChange, ...props }: NumberInputProps) {
  return (
    <ParsedInput
      type="number"
      {...props}
      format={formatNumber}
      parse={parseNumber}
      onValueChange={(v) => onValueChange(v ?? undefined)}
    />
  );
}
