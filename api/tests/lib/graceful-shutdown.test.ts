import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { installEarlyExit, installGracefulShutdown, SHUTDOWN_DEADLINE_MS } from '../../src/lib/graceful-shutdown';

// #673: once Node is PID 1 in the container, a signal without a handler is
// ignored by the kernel. A stop during startup (database down, retry loop)
// must exit at once, and a graceful shutdown must not outlast Docker's 10 s.

function fakeProcess() {
  const proc = new EventEmitter() as EventEmitter & { exit: ReturnType<typeof vi.fn> };
  proc.exit = vi.fn();
  return proc;
}

describe('graceful shutdown (#673)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  it('exits at once on SIGTERM or SIGINT received during startup', () => {
    const proc = fakeProcess();
    installEarlyExit(proc as unknown as NodeJS.Process);
    proc.emit('SIGTERM');
    expect(proc.exit).toHaveBeenCalledWith(0);
    proc.exit.mockClear();
    proc.emit('SIGINT');
    expect(proc.exit).toHaveBeenCalledWith(0);
  });

  it('replaces the startup handler: closes the server, disconnects, then exits 0', async () => {
    const proc = fakeProcess();
    installEarlyExit(proc as unknown as NodeJS.Process);
    let closed: (() => void) | undefined;
    const server = { close: vi.fn((cb: () => void) => { closed = cb; }), closeAllConnections: vi.fn() };
    const disconnect = vi.fn().mockResolvedValue(undefined);
    installGracefulShutdown(server, disconnect, proc as unknown as NodeJS.Process);

    proc.emit('SIGTERM');
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(proc.exit).not.toHaveBeenCalled();

    closed?.();
    await vi.runAllTicks();
    await Promise.resolve();
    expect(disconnect).toHaveBeenCalled();
    expect(proc.exit).toHaveBeenCalledWith(0);
  });

  it('forces the exit when in-flight requests outlast the deadline', () => {
    const proc = fakeProcess();
    const server = { close: vi.fn(), closeAllConnections: vi.fn() };
    installGracefulShutdown(server, vi.fn().mockResolvedValue(undefined), proc as unknown as NodeJS.Process);

    proc.emit('SIGTERM');
    vi.advanceTimersByTime(SHUTDOWN_DEADLINE_MS - 1);
    expect(proc.exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(server.closeAllConnections).toHaveBeenCalled();
    expect(proc.exit).toHaveBeenCalledWith(1);
    expect(SHUTDOWN_DEADLINE_MS).toBeLessThan(10_000);
  });
});
