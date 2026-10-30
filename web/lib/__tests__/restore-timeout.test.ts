import { describe, it, expect, vi, afterEach } from 'vitest';
import { client, DEFAULT_TIMEOUT_MS } from '../api';
import { configClient, RESTORE_TIMEOUT_MS } from '../config/client';
import config from '../../next.config.mjs';

// #666: a restore now takes a safety backup and then replays a whole dump, far
// longer than the usual 15 s request budget. The browser waits longer, but
// gives up just before the /api proxy so the dialog can explain the restore is
// still running instead of showing the proxy's error.
describe('backup restore timeout', () => {
  const proxyTimeout = (config('phase-production-build') as { experimental?: { proxyTimeout?: number } }).experimental?.proxyTimeout ?? 30_000;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits longer than an ordinary request', () => {
    expect(RESTORE_TIMEOUT_MS).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
  });

  it('gives up before the /api proxy does', () => {
    expect(RESTORE_TIMEOUT_MS).toBeLessThan(proxyTimeout);
  });

  it('is the budget the restore request is sent with', async () => {
    const post = vi.spyOn(client, 'post').mockResolvedValue({ data: { ok: true } });
    await configClient.restoreBackup('b1', 'pw');
    expect(post).toHaveBeenCalledWith('/admin/backups/b1/restore', { confirm: true, password: 'pw' }, { timeoutMs: RESTORE_TIMEOUT_MS });
  });
});
