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

describe('useLeaveGuard — Back (#759)', () => {
  const back = () => window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

  it('keeps an extra entry on top while active, and stays on a declined Back, unseen by the router', () => {
    // Next.js's router listens to popstate too: it must not see a declined Back.
    const routerSaw = vi.fn();
    window.addEventListener('popstate', routerSaw);
    window.history.replaceState(null, '', window.location.href);
    const pushState = vi.spyOn(window.history, 'pushState');
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { unmount } = render(<Page active onFollow={() => {}} />);
    expect(pushState).toHaveBeenCalledTimes(1);

    back();

    expect(confirm).toHaveBeenCalledWith('Leave without saving?');
    expect(routerSaw).not.toHaveBeenCalled();
    expect(historyBack).not.toHaveBeenCalled();
    // The entry is put back, so the next Back asks again.
    expect(pushState).toHaveBeenCalledTimes(2);
    unmount();
    window.removeEventListener('popstate', routerSaw);
  });

  it('really goes back once the person confirms', () => {
    window.history.replaceState(null, '', window.location.href);
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { unmount } = render(<Page active onFollow={() => {}} />);

    back();

    expect(historyBack).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('adds no history entry while there is nothing to lose', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<Page active={false} onFollow={() => {}} />);
    expect(pushState).not.toHaveBeenCalled();
  });
});
