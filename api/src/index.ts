import cron from 'node-cron';
import { connectWithRetry } from './lib/prisma';
import { createApp } from './app';
import { inventoryService } from './services/inventory.service';
import { MaintenanceService } from './services/maintenance.service';
import { recomputeAlertStatuses } from './services/alert.service';
import { backupService } from './services/backup.service';
import { findSecretProblems, describeSecretProblem } from './lib/startup-secrets';

// ─── Startup secret guard ────────────────────────────────────────────────────
// Security hardening: `.env.example` ships two placeholder secrets
// (JWT_SECRET, CONFIG_ENCRYPTION_KEY) that are public — committed to this
// repo, printed in the README/wiki. An instance still running on either of
// them is trivially compromised (forgeable auth tokens / decryptable stored
// config secrets). An instance with either of them missing or malformed
// cannot even sign a session (ISSUE #247). In production, refuse to accept
// any request until real values are set. In development, only warn —
// `docker compose up` (dev compose) must keep working out of the box for
// local hacking without forcing every contributor to mint fresh secrets first.
function assertSecretsConfigured(): void {
  const problems = findSecretProblems(process.env);
  if (problems.length === 0) return;

  const isDev = process.env.NODE_ENV === 'development';
  for (const problem of problems) {
    const msg = `🛑 ${describeSecretProblem(problem)}`;
    if (isDev) console.warn(`[startup] WARNING: ${msg}`);
    else console.error(`[startup] FATAL: ${msg}`);
  }
  if (!isDev) {
    console.error('[startup] Refusing to start with missing or example secrets outside development. Set NODE_ENV=development to bypass locally.');
    process.exit(1);
  }
}

assertSecretsConfigured();

const app = createApp();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ─── Startup ─────────────────────────────────────────────────────────────────

async function runAlertStatusRecompute(origin: 'startup' | 'cron'): Promise<void> {
  try {
    const { scanned, updated } = await recomputeAlertStatuses();
    if (updated > 0) {
      console.info(`[${origin}] Alert statuses refreshed: ${updated} of ${scanned} items updated`);
    }
  } catch (err) {
    console.error(`[${origin}] Alert status recompute failed:`, err);
  }
}

async function bootstrap(): Promise<void> {
  await connectWithRetry();

  // Background maintenance: purge old trash
  void inventoryService.purgeTrashed().then((count) => {
    if (count > 0) console.info(`[startup] Purged ${count} permanently deleted items`);
  });

  // FEAT-39: data retention cleanup (audit logs, expired/revoked sessions,
  // trusted devices and guest shares). Run once immediately on startup so a
  // restart doesn't have to wait up to 24h for the first cleanup, then keep
  // it scheduled daily.
  void MaintenanceService.runRetentionCleanup('scheduled').then((run) => {
    if (run.success) console.info('[startup] Retention cleanup completed:', run.counts);
    else console.error('[startup] Retention cleanup failed:', run.error);
  });

  // ISSUE_033: the denormalised `alertStatus` column depends on the current
  // year, so it goes stale on its own every 1st of January. Realign it on
  // startup and once a day, otherwise the consumers reading it straight from
  // SQL (analytics, guest shares) keep reporting a frozen picture.
  void runAlertStatusRecompute('startup');

  // Scheduled daily at 3:00 AM server time — chosen as a low-traffic window
  // for a self-hosted home-lab instance, well outside typical usage hours.
  cron.schedule('0 3 * * *', () => {
    void MaintenanceService.runRetentionCleanup('scheduled').then((run) => {
      if (run.success) console.info('[cron] Retention cleanup completed:', run.counts);
      else console.error('[cron] Retention cleanup failed:', run.error);
    });
    void runAlertStatusRecompute('cron');
  });

  // FEAT-18: scheduled database backups (pg_dump). Ticks hourly and re-reads
  // SystemConfig (backupEnabled/backupHourUtc) on every tick — see
  // backupService.runScheduledIfDue — so an admin can enable/disable or
  // change the target hour without restarting the container. Only produces
  // an actual backup once, when the current UTC hour matches the configured
  // one, so it behaves as a once-a-day job despite the hourly tick.
  cron.schedule('0 * * * *', () => {
    void backupService.runScheduledIfDue()
      .then((run) => {
        if (!run) return;
        if (run.success) console.info('[cron] Backup completed:', run.filePath);
        else console.error('[cron] Backup failed:', run.error);
      })
      .catch((err) => console.error('[cron] Backup cron tick failed:', err));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.info(`[api] Server listening on port ${PORT} (${process.env.NODE_ENV})`);
  });
}

bootstrap().catch((err) => {
  console.error('[api] Fatal startup error:', err);
  process.exit(1);
});
