// #673: in the container, Node is PID 1 (`exec` in the Dockerfile CMD). The
// kernel ignores a signal PID 1 has no handler for, so without these handlers
// a stop would still wait for Docker's 10 s grace period and its SIGKILL.

const SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/** Under Docker's 10 s grace period, so the exit is ours, not a SIGKILL. */
export const SHUTDOWN_DEADLINE_MS = 8000;

const earlyHandlers = new Map<string, () => void>();

interface ClosableServer {
  close(callback?: (err?: Error) => void): unknown;
  closeAllConnections(): void;
}

/**
 * Before the server listens (database retry loop, startup jobs), nothing is in
 * flight that would be worth waiting for: a stop exits at once.
 */
export function installEarlyExit(proc: NodeJS.Process = process): void {
  for (const signal of SIGNALS) {
    const handler = () => {
      console.info(`[api] ${signal} received during startup, exiting`);
      proc.exit(0);
    };
    earlyHandlers.set(signal, handler);
    proc.on(signal, handler);
  }
}

/**
 * ISSUE_091: `server.close()` stops accepting new connections and waits for
 * in-flight requests to finish before the database connections are closed.
 * A request that never ends (e.g. a label scan waiting on Ollama) is cut after
 * SHUTDOWN_DEADLINE_MS. Replaces the startup handlers.
 */
export function installGracefulShutdown(
  server: ClosableServer,
  disconnect: () => Promise<unknown>,
  proc: NodeJS.Process = process,
): void {
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.info(`[api] ${signal} received, shutting down gracefully`);
    setTimeout(() => {
      console.error(`[api] Requests still running after ${SHUTDOWN_DEADLINE_MS} ms, forcing exit`);
      server.closeAllConnections();
      proc.exit(1);
    }, SHUTDOWN_DEADLINE_MS).unref();
    server.close(() => {
      void disconnect().finally(() => proc.exit(0));
    });
  };
  for (const signal of SIGNALS) {
    const early = earlyHandlers.get(signal);
    if (early) proc.off(signal, early);
    proc.on(signal, () => shutdown(signal));
  }
}
