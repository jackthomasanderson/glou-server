import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

let online: boolean | null = true;
const get = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => online }));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({
    data: [{ name: 'Cellar Cuvee', producer: 'Cellar Estate', category: 'wine', vintage: 2019 }],
  }),
}));
vi.mock('@/lib/api', () => ({ client: { get: (...a: unknown[]) => get(...a) } }));

import { ProducerAutocomplete } from '../ProducerAutocomplete';
import { ProductAutocomplete } from '../ProductAutocomplete';

function Producer() {
  const [v, setV] = useState('');
  return <ProducerAutocomplete value={v} onChange={setV} category="wine" label="Producer" />;
}
function Product() {
  const [v, setV] = useState('');
  return <ProductAutocomplete value={v} onChange={setV} onSelect={() => {}} category="wine" />;
}
const renderField = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  online = true;
  get.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe.each([
  ['Producer', Producer, 'inventory-producer-input'],
  ['Name', Product, 'inventory-name-input'],
])('%s field (#630)', (_label, Field, testId) => {
  it('says suggestions are unavailable when offline, and asks nothing', () => {
    online = false;
    renderField(<Field />);
    expect(screen.queryByText('connectivity.degraded')).toBeTruthy();
    fireEvent.change(screen.getByTestId(testId), { target: { value: 'ch' } });
    expect(get).not.toHaveBeenCalled();
  });

  it('shows no warning online', () => {
    renderField(<Field />);
    expect(screen.queryByText('connectivity.degraded')).toBeNull();
  });

  it('asks the server once typing pauses, and lists cellar then server suggestions', async () => {
    vi.useFakeTimers();
    get.mockResolvedValue({
      data: _label === 'Producer'
        ? ['Cellar Estate', 'Chateau Server']
        : [{ source: 'external', name: 'Server Cuvee', producer: 'Chateau Server', category: 'wine' }],
    });
    renderField(<Field />);
    fireEvent.change(screen.getByTestId(testId), { target: { value: 'ce' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(get).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(get).toHaveBeenCalledTimes(1);
    expect(String(get.mock.calls[0][0])).toContain('q=ce');
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    const options = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(options[0]).toContain(_label === 'Producer' ? 'Cellar Estate' : 'Cellar Cuvee');
    expect(options.some((o) => /Server|Chateau Server/.test(o))).toBe(true);
    // A producer already proposed from the cellar is not repeated from the server.
    if (_label === 'Producer') expect(options.filter((o) => o.includes('Cellar Estate'))).toHaveLength(1);
  });
});
