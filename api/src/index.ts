import cron from 'node-cron';
import { connectWithRetry } from './lib/prisma';
import { createApp } from './app';
import { inventoryService } from './services/inventory.service';
import { MaintenanceService } from './services/maintenance.service';
import { backupService } from './services/backup.service';

// ─── Startup secret guard ────────────────────────────────────────────────────
// Security hardening: `.env.example` ships two placeholder secrets
// (JWT_SECRET, CONFIG_ENCRYPTION_KEY) that are public — committed to this
// repo, printed in the README/wiki. An instance still running on either of
// them is trivially compromised (forgeable auth tokens / decryptable stored
// config secrets). In production, refuse to accept any request until real
// values are set. In development, only warn — `docker compose up` (dev
// compose) must keep working out of the box for local hacking without
// forcing every contributor to mint fresh secrets first.
const PLACEHOLDER_JWT_SECRET =
  'change_me_with_a_strong_random_secret_of_at_least_64_chars_long_xxxxxxxxxxx';
const PLACEHOLDER_CONFIG_ENCRYPTION_KEY =
  '0000000000000000000000000000000000000000000000000000000000000000';

function assertSecretsConfigured(): void {
  const offenders: string[] = [];
  if (process.env.JWT_SECRET === PLACEHOLDER_JWT_SECRET) offenders.push('JWT_SECRET');
  if (process.env.CONFIG_ENCRYPTION_KEY === PLACEHOLDER_CONFIG_ENCRYPTION_KEY) {
    offenders.push('CONFIG_ENCRYPTION_KEY');
  }
  if (offenders.length === 0) return;

  const isDev = process.env.NODE_ENV === 'development';
  for (const name of offenders) {
    const msg =
      `🛑 ${name} still has its .env.example placeholder value — generate a real secret ` +
      `before starting (e.g. \`openssl rand -base64 32\`). ` +
      `See docs/wiki/EN/01-Installation.md (FR: docs/wiki/FR/01-Installation.md).`;
    if (isDev) console.warn(`[startup] WARNING: ${msg}`);
    else console.error(`[startup] FATAL: ${msg}`);
  }
  if (!isDev) {
    console.error('[startup] Refusing to start with example secrets outside development. Set NODE_ENV=development to bypass locally.');
    process.exit(1);
  }
}

assertSecretsConfigured();

const app = createApp();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ─── Startup ─────────────────────────────────────────────────────────────────

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

  // Scheduled daily at 3:00 AM server time — chosen as a low-traffic window
  // for a self-hosted home-lab instance, well outside typical usage hours.
  cron.schedule('0 3 * * *', () => {
    void MaintenanceService.runRetentionCleanup('scheduled').then((run) => {
      if (run.success) console.info('[cron] Retention cleanup completed:', run.counts);
      else console.error('[cron] Retention cleanup failed:', run.error);
    });
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
