import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { useLeaveGuard } from './useLeaveGuard';
import { confirmLeave, leaveThen, onLeaveEntry, pushLeaveEntry } from '@/lib/leaveGuard';

// #759: settings typed but not saved were lost without a word when the admin
// left or reloaded the page.

function Page({ active, onFollow, message = 'Leave without saving?' }: { active: boolean; onFollow: () => void; message?: string }) {
  useLeaveGuard(active, message);
  return (
    <div onClick={(e) => { if (!e.defaultPrevented) { onFollow(); e.preventDefault(); } }}>
      <a href="/inventory">Inventory</a>
      <a href="#top">Top</a>
    </div>
  );
}

beforeEach(() => {
  // Each test starts on a plain entry, with no step left to swallow from an
  // earlier test's page (its guard turning off steps back once).
  vi.spyOn(window.history, 'back').mockImplementation(() => {});
  window.history.replaceState(null, '', '/admin');
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
});

afterEach(() => {
  cleanup();
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
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onFollow = vi.fn();
    const { getByText } = render(<Page active onFollow={onFollow} />);

    fireEvent.click(getByText('Inventory'));
    // #920: from the page's own entry, not the extra one ([P, page, B]).
    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(onFollow).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    expect(onFollow).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);

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

  it('keeps an extra entry on top while active, and stays on a declined Back', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { unmount } = render(<Page active onFollow={() => {}} />);
    expect(pushState).toHaveBeenCalledTimes(1);

    back();

    expect(confirm).toHaveBeenCalledWith('Leave without saving?');
    expect(historyBack).not.toHaveBeenCalled();
    // The entry is put back, so the next Back asks again.
    expect(pushState).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('really goes back once the person confirms', () => {
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { unmount } = render(<Page active onFollow={() => {}} />);

    back();

    expect(historyBack).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('takes the extra entry away once there is nothing left to lose, and asks nothing after', () => {
    // Back lands on the page's own entry.
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => window.history.replaceState(null, '', window.location.href));
    const confirm = vi.spyOn(window, 'confirm');
    const { rerender } = render(<Page active onFollow={() => {}} />);

    rerender(<Page active={false} onFollow={() => {}} />);

    expect(historyBack).toHaveBeenCalledTimes(1);
    // The step back onto the page itself, then a later Back: no question.
    back();
    back();
    expect(confirm).not.toHaveBeenCalled();
    expect(confirmLeave()).toBe(true);
  });

  it('touches no history when only the question changes (another language)', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender, unmount } = render(<Page active onFollow={() => {}} />);
    rerender(<Page active message="Quitter sans enregistrer ?" onFollow={() => {}} />);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(historyBack).not.toHaveBeenCalled();
    unmount();
  });

  it('adds no history entry while there is nothing to lose', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    render(<Page active={false} onFollow={() => {}} />);
    expect(pushState).not.toHaveBeenCalled();
  });
});

// #920: the remaining paths and history edge cases.
describe('useLeaveGuard — history after leaving (#920)', () => {
  const pop = () => window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));

  it('a menu leaves from the page\'s own entry, so no step is left that does nothing', () => {
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => window.history.replaceState(null, '', window.location.href));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const go = vi.fn();
    const { unmount } = render(<Page active onFollow={() => {}} />);
    expect(onLeaveEntry()).toBe(true);

    expect(leaveThen(go)).toBe(true);
    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
    pop();
    expect(go).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('a menu declined stays put and touches no history', () => {
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const go = vi.fn();
    const { unmount } = render(<Page active onFollow={() => {}} />);
    expect(leaveThen(go)).toBe(false);
    expect(go).not.toHaveBeenCalled();
    expect(historyBack).not.toHaveBeenCalled();
    unmount();
  });

  it('steps over an extra entry left behind once nothing is left to lose (Back, then Forward)', () => {
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    pushLeaveEntry();
    pop();
    expect(historyBack).toHaveBeenCalledTimes(1);
  });

  it('on the tab\'s first entry, a confirmed Back that cannot go anywhere keeps the page guarded', () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(window.history, 'back').mockImplementation(() => {});
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const pushState = vi.spyOn(window.history, 'pushState');
      const { unmount } = render(<Page active onFollow={() => {}} />);
      window.history.replaceState(null, '', window.location.href);
      pop();
      act(() => { vi.advanceTimersByTime(1000); });
      expect(onLeaveEntry()).toBe(true);
      expect(pushState).toHaveBeenCalledTimes(2);
      expect(unload().defaultPrevented).toBe(true);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a jump of several entries, confirmed, goes where asked and no further', () => {
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { unmount } = render(<Page active onFollow={() => {}} />);
    window.history.replaceState(null, '', '/inventory');
    pop();
    expect(historyBack).not.toHaveBeenCalled();
    unmount();
  });

  it('a jump declined comes back exactly with the Navigation API', () => {
    let index = 4;
    Object.defineProperty(window, 'navigation', { configurable: true, value: { get currentEntry() { return { index }; } } });
    try {
      const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { unmount } = render(<Page active onFollow={() => {}} />);
      index = 1;
      window.history.replaceState(null, '', '/inventory');
      const event = new PopStateEvent('popstate', { state: null });
      const routerSees = vi.fn();
      window.addEventListener('popstate', routerSees);
      window.dispatchEvent(event);
      expect(go).toHaveBeenCalledWith(3);
      expect(routerSees).not.toHaveBeenCalled();
      window.removeEventListener('popstate', routerSees);
      unmount();
    } finally {
      delete (window as unknown as { navigation?: unknown }).navigation;
    }
  });

  it('a jump declined without the Navigation API puts the page back on top, at its own address', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const pushState = vi.spyOn(window.history, 'pushState');
    const { unmount } = render(<Page active onFollow={() => {}} />);
    window.history.replaceState(null, '', '/inventory');
    pop();
    expect(pushState).toHaveBeenLastCalledWith(expect.objectContaining({ __glouLeaveGuard: true }), '', expect.stringMatching(/\/admin$/));
    expect(window.location.pathname).toBe('/admin');
    unmount();
  });
});
