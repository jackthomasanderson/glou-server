import { describe, it, expect } from 'vitest';
import { CSV_IMPORT_TRANSACTION_MAX_WAIT_MS, CSV_IMPORT_TRANSACTION_TIMEOUT_MS } from '@shared/import';
import { CONFIRM_TIMEOUT_MS } from '../import/client';
import config from '../../next.config.mjs';

// FEAT-91 (#641): the import request crosses Next's /api rewrite proxy, which
// cut it at 30 s by default — long before the server's transaction budget —
// and the screen then reported a failure for an import still being written.
// Whoever gives up first must be the server: its budget, then the proxy, then
// the browser.
describe('CSV import timeouts', () => {
  const serverBudget = CSV_IMPORT_TRANSACTION_MAX_WAIT_MS + CSV_IMPORT_TRANSACTION_TIMEOUT_MS;
  const proxyTimeout = (config('phase-production-build') as { experimental?: { proxyTimeout?: number } }).experimental?.proxyTimeout ?? 30_000;

  it('the /api proxy waits longer than the server may work on an import', () => {
    expect(proxyTimeout).toBeGreaterThan(serverBudget);
  });

  it('the browser waits at least as long as the proxy', () => {
    expect(CONFIRM_TIMEOUT_MS).toBeGreaterThanOrEqual(proxyTimeout);
  });
});
