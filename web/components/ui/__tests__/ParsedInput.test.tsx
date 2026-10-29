import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NumberInput, ParsedInput } from '../ParsedInput';

// #706: a controlled field rendering its parsed value back rewrote what the
// user typed ("24,05" → "245"). A plain controlled <input> stands in for
// HeroUI's, which is what React rewrites the same way.
vi.mock('@heroui/react', () => ({
  Input: ({ value, onValueChange, label }: { value: string; onValueChange: (v: string) => void; label: string }) => (
    <input aria-label={label} value={value} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

/** Types `text` one character at a time, like a keyboard. */
function typeInto(input: HTMLElement, text: string) {
  for (let i = 1; i <= text.length; i++) fireEvent.change(input, { target: { value: text.slice(0, i) } });
}

function PriceField({ onValue }: { onValue?: (v: number | undefined) => void }) {
  const [price, setPrice] = useState<number | undefined>();
  return (
    <>
      <NumberInput label="price" value={price} onValueChange={(v) => { setPrice(v); onValue?.(v); }} />
      <button onClick={() => setPrice(2019)}>fill</button>
    </>
  );
}

describe('NumberInput', () => {
  it('keeps a 0 typed right after the decimal separator', () => {
    const onValue = vi.fn();
    render(<PriceField onValue={onValue} />);
    const input = screen.getByLabelText('price') as HTMLInputElement;

    typeInto(input, '24.0');
    expect(input.value).toBe('24.0');
    expect(onValue).toHaveBeenLastCalledWith(24);

    typeInto(input, '24.05');
    expect(input.value).toBe('24.05');
    expect(onValue).toHaveBeenLastCalledWith(24.05);
  });

  it('keeps a trailing 0 ("24.90")', () => {
    render(<PriceField />);
    const input = screen.getByLabelText('price') as HTMLInputElement;
    typeInto(input, '24.90');
    expect(input.value).toBe('24.90');
  });

  it('reports an emptied field as undefined', () => {
    const onValue = vi.fn();
    render(<PriceField onValue={onValue} />);
    const input = screen.getByLabelText('price') as HTMLInputElement;
    typeInto(input, '7');
    fireEvent.change(input, { target: { value: '' } });
    expect(onValue).toHaveBeenLastCalledWith(undefined);
    expect(input.value).toBe('');
  });

  it('shows a value set from outside (reset, autocomplete)', () => {
    render(<PriceField />);
    const input = screen.getByLabelText('price') as HTMLInputElement;
    typeInto(input, '24.0');
    fireEvent.click(screen.getByText('fill'));
    expect(input.value).toBe('2019');
  });

  it('lets a field with a fallback be emptied to type over it', () => {
    function Quantity() {
      const [qty, setQty] = useState(1);
      return <NumberInput label="qty" value={qty} onValueChange={(v) => setQty(v ?? 1)} />;
    }
    render(<Quantity />);
    const input = screen.getByLabelText('qty') as HTMLInputElement;
    expect(input.value).toBe('1');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '3' } });
    expect(input.value).toBe('3');
  });
});

describe('ParsedInput (comma-separated list)', () => {
  function Grapes({ onValue }: { onValue: (v: string[]) => void }) {
    const [list, setList] = useState<string[] | undefined>();
    return (
      <ParsedInput
        label="grapes"
        value={list ?? []}
        format={(l) => l.join(', ')}
        parse={(text) => text.split(',').map((s) => s.trim()).filter(Boolean)}
        onValueChange={(l) => { setList(l); onValue(l); }}
      />
    );
  }

  it('keeps spaces and commas while typing "Pinot Noir, Gamay"', () => {
    const onValue = vi.fn();
    render(<Grapes onValue={onValue} />);
    const input = screen.getByLabelText('grapes') as HTMLInputElement;

    typeInto(input, 'Pinot Noir, ');
    expect(input.value).toBe('Pinot Noir, ');
    expect(onValue).toHaveBeenLastCalledWith(['Pinot Noir']);

    typeInto(input, 'Pinot Noir, Gamay');
    expect(input.value).toBe('Pinot Noir, Gamay');
    expect(onValue).toHaveBeenLastCalledWith(['Pinot Noir', 'Gamay']);
  });
});
