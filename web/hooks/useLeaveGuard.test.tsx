import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useLeaveGuard } from './useLeaveGuard';

// #759: settings typed but not saved were lost without a word when the admin
// left or reloaded the page.

function Page({ active, onFollow }: { active: boolean; onFollow: () => void }) {
  useLeaveGuard(active, 'Leave without saving?');
  return (
    <div onClick={(e) => { if (!e.defaultPrevented) { onFollow(); e.preventDefault(); } }}>
      <a href="/inventory">Inventory</a>
      <a href="#top">Top</a>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

const unload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('useLeaveGuard (#759)', () => {
  it('asks the browser to confirm a reload or a closed tab while active', () => {
    const { rerender } = render(<Page active onFollow={() => {}} />);
    expect(unload().defaultPrevented).toBe(true);

    rerender(<Page active={false} onFollow={() => {}} />);
    expect(unload().defaultPrevented).toBe(false);
  });

  it('does not follow a link of the app the admin declines to leave for', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onFollow = vi.fn();
    const { getByText } = render(<Page active onFollow={onFollow} />);

    fireEvent.click(getByText('Inventory'));

    expect(confirm).toHaveBeenCalledWith('Leave without saving?');
    expect(onFollow).not.toHaveBeenCalled();
  });

  it('follows it once the admin confirms, and asks nothing for a link within the page', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onFollow = vi.fn();
    const { getByText } = render(<Page active onFollow={onFollow} />);

    fireEvent.click(getByText('Inventory'));
    expect(onFollow).toHaveBeenCalledTimes(1);

    confirm.mockClear();
    fireEvent.click(getByText('Top'));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks nothing while there is nothing to lose', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onFollow = vi.fn();
    const { getByText } = render(<Page active={false} onFollow={onFollow} />);
    fireEvent.click(getByText('Inventory'));
    expect(confirm).not.toHaveBeenCalled();
    expect(onFollow).toHaveBeenCalled();
  });
});
