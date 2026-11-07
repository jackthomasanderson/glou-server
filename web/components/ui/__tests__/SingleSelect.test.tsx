import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SelectItem } from '@heroui/react';
import { SingleSelect } from '@/components/ui/SingleSelect';

function Controlled({ onChange }: { onChange: (key: string) => void }) {
  const [value, setValue] = useState('garage');
  return (
    <SingleSelect label="Cave" selectedKeys={[value]} onSelectionChange={(keys) => { const [key] = Array.from(keys); setValue(String(key)); onChange(String(key)); }}>
      <SelectItem key="garage">Garage</SelectItem>
      <SelectItem key="kitchen">Cuisine</SelectItem>
    </SingleSelect>
  );
}

async function pick(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /Cave/ }));
  const option = (await screen.findAllByRole('option')).find((o) => o.textContent === name) as HTMLElement;
  fireEvent.click(option);
}

describe('SingleSelect (recette n°5 and n°5 bis of #847)', () => {
  it('picking the choice again keeps it, closes the list and tells nothing to the page', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await pick('Garage');
    const trigger = screen.getByRole('button', { name: /Cave/ });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).toHaveTextContent('Garage');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('another choice is told and closes the list', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await pick('Cuisine');
    const trigger = screen.getByRole('button', { name: /Cave/ });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    expect(trigger).toHaveTextContent('Cuisine');
    expect(onChange).toHaveBeenCalledWith('kitchen');
  });

  it('uncontrolled: the choice again is not told either', async () => {
    const onChange = vi.fn();
    render(
      <SingleSelect label="Cave" defaultSelectedKeys={['garage']} onSelectionChange={onChange}>
        <SelectItem key="garage">Garage</SelectItem>
        <SelectItem key="kitchen">Cuisine</SelectItem>
      </SingleSelect>,
    );
    await pick('Cuisine');
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    await pick('Cuisine');
    await waitFor(() => expect(screen.getByRole('button', { name: /Cave/ })).toHaveAttribute('aria-expanded', 'false'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
