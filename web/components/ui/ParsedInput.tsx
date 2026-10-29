'use client';
import React, { useState } from 'react';
import { Input, InputProps } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { decimalSeparator } from '@/lib/format';

type ParsedInputProps<T> = Omit<InputProps, 'value' | 'onValueChange'> & {
  value: T;
  onValueChange: (value: T) => void;
  /** Text shown for a value set from outside (form reset, autocomplete). */
  format: (value: T) => string;
  parse: (text: string) => T;
  /** A keystroke whose text fails this is ignored, like in a number field. */
  allowText?: (text: string) => boolean;
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
export function ParsedInput<T>({ value, onValueChange, format, parse, allowText, ...props }: ParsedInputProps<T>) {
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
        if (allowText && !allowText(next)) return;
        setText(next);
        onValueChange(parse(next));
      }}
    />
  );
}

type NumberValue = number | null | undefined;

const formatInteger = (n: NumberValue) => (n == null || Number.isNaN(n) ? '' : String(n));
const parseInteger = (text: string) => (text.trim() === '' ? undefined : Number(text));

// Digits with at most one separator, either "," or ".": "24,05", "24.", ",5".
const DECIMAL_TEXT = /^\d*[.,]?\d*$/;
const parseDecimal = (text: string) => {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() === '' || Number.isNaN(n) ? undefined : n;
};

type NumberInputProps = Omit<ParsedInputProps<NumberValue>, 'format' | 'parse' | 'allowText' | 'onValueChange'> & {
  /** `undefined` when the field is emptied. */
  onValueChange: (value: number | undefined) => void;
  /**
   * A price, a degree: a text field taking "," as well as ".". A number field
   * only takes the separator of the browser's locale and drops the other
   * one, so "24,05" in an English browser became 2405 (#706).
   */
  decimal?: boolean;
};

/**
 * A number field that keeps "24,0" or "24," while it is typed.
 * Not HeroUI's own `NumberInput`, a different component.
 */
export function ParsedNumberInput({ onValueChange, decimal = false, ...props }: NumberInputProps) {
  const { i18n } = useTranslation();
  const separator = decimalSeparator(i18n.language);
  const emit = (v: NumberValue) => onValueChange(v ?? undefined);
  if (!decimal) {
    return <ParsedInput type="number" {...props} format={formatInteger} parse={parseInteger} onValueChange={emit} />;
  }
  return (
    <ParsedInput
      inputMode="decimal"
      {...props}
      type="text"
      format={(n) => formatInteger(n).replace('.', separator)}
      parse={parseDecimal}
      allowText={(text) => DECIMAL_TEXT.test(text.trim())}
      onValueChange={emit}
    />
  );
}
