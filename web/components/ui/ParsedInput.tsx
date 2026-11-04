'use client';
import React, { useEffect, useRef, useState } from 'react';
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
  inputRef?: React.Ref<HTMLInputElement>;
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
export function ParsedInput<T>({ value, onValueChange, format, parse, allowText, inputRef, ...props }: ParsedInputProps<T>) {
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
      ref={inputRef}
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

type RangeProps = Pick<InputProps, 'min' | 'max' | 'isInvalid' | 'onBlur'> & { value: NumberValue };

/**
 * A number field with a range (a vintage from 1800 to this year) and no error
 * of its own checks that range itself (recette #471, lot RD point 1). Left to
 * the browser, "202" refused on save kept its message after being corrected
 * to 2020: HeroUI only re-reads the browser's check on a "change" event, which
 * waits for the field to be left. Here the message shows when the field is
 * left or the form is sent, in the interface language, and goes as soon as
 * the field is typed in again (ux-ui.md §5.3). The browser still refuses to
 * send the form while the value is out of range.
 */
function useRangeCheck({ min, max, isInvalid, onBlur, value }: RangeProps, t: (key: string, values?: Record<string, unknown>) => string) {
  const [shown, setShown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const checks = (min != null || max != null) && isInvalid === undefined;
  useEffect(() => {
    const input = inputRef.current;
    if (!checks || !input) return;
    // The form was sent with this value out of range: our message, not the browser's bubble.
    const refused = (event: Event) => {
      event.preventDefault();
      setShown(true);
      if (input.form && Array.from(input.form.elements).find((element) => (element as HTMLInputElement).validity?.valid === false) === input) input.focus();
    };
    input.addEventListener('invalid', refused);
    return () => input.removeEventListener('invalid', refused);
  }, [checks]);
  if (!checks) return { typed: () => {}, props: {} };
  const outOfRange = value != null && !Number.isNaN(value) && ((min != null && value < Number(min)) || (max != null && value > Number(max)));
  const key = min != null && max != null ? 'inventory.validation.range' : min != null ? 'inventory.validation.atLeast' : 'inventory.validation.atMost';
  return {
    typed: () => setShown(false),
    props: {
      inputRef,
      validationBehavior: 'aria' as const,
      isInvalid: shown,
      errorMessage: t(key, { min, max }),
      onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
        setShown(outOfRange);
        onBlur?.(event);
      },
    },
  };
}

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
  const { t, i18n } = useTranslation();
  const separator = decimalSeparator(i18n.language);
  const range = useRangeCheck(props, t);
  const emit = (v: NumberValue) => {
    range.typed();
    onValueChange(v ?? undefined);
  };
  if (!decimal) {
    return <ParsedInput type="number" {...props} {...range.props} format={formatInteger} parse={parseInteger} onValueChange={emit} />;
  }
  return (
    <ParsedInput
      inputMode="decimal"
      {...props}
      {...range.props}
      type="text"
      format={(n) => formatInteger(n).replace('.', separator)}
      parse={parseDecimal}
      allowText={(text) => DECIMAL_TEXT.test(text.trim())}
      onValueChange={emit}
    />
  );
}
