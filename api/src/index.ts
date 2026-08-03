import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { connectWithRetry } from './lib/prisma';
import { inventoryRouter } from './routes/inventory.router';
import { authRouter } from './routes/auth.router';
import cellarsRouter from './routes/cellars.router';
import userRouter from './routes/user.router';
import adminRouter from './routes/admin.router';
import bulkPresetsRouter from './routes/bulk-presets.router';
import { alertsRouter } from './routes/alerts.router';
import { consumptionPlanRouter } from './routes/consumption-plan.router';
import { inventoryCountRouter } from './routes/inventory-count.router';
import { maturityReferencesRouter } from './routes/maturity-references.router';
import { errorMiddleware } from './middleware/error.middleware';
import { inventoryService } from './services/inventory.service';
import { MaintenanceService } from './services/maintenance.service';
import { backupService } from './services/backup.service';
import searchRouter from './routes/search.router';
import collectionsRouter from './routes/collections.router';
import tastingsRouter from './routes/tastings.router';
import { analyticsRouter } from './routes/analytics.router';
import sharesRouter from './routes/shares.router';
import guestRouter from './routes/guest.router';
import { importRouter } from './routes/import.router';
import wishlistRouter from './routes/wishlist.router';
import { scanRouter } from './routes/scan.router';
import humidorRouter from './routes/humidor.router';

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

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ─── Security middleware ─────────────────────────────────────────────────────

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

// ─── Health check ────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Connectivity check (no auth) ────────────────────────────────────────────

app.get('/api/connectivity', async (_req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch('https://dns.google/resolve?name=google.com&type=A', { signal: controller.signal });
    clearTimeout(timeout);
    res.json({ online: true });
  } catch {
    res.json({ online: false });
  }
});

// ─── Static Files ──────────────────────────────────────────────────────────────

import path from 'path';
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── Routes ──────────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/2fa', authLimiter);

app.use('/api/auth', authRouter);
app.use('/api/cellars', cellarsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/bulk-presets', bulkPresetsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/consumption-plan', consumptionPlanRouter);
app.use('/api/inventory-count', inventoryCountRouter);
app.use('/api/user', userRouter);
app.use('/api/admin', adminRouter);
app.use('/api/maturity-references', maturityReferencesRouter);
app.use('/api/search', searchRouter);
app.use('/api/collections', collectionsRouter);
app.use('/api/tastings', tastingsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/guest/:token', guestRouter);
app.use('/api/import', importRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/scan', scanRouter);
app.use('/api/humidor', humidorRouter);

// ─── 404 handler ────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

// ─── Global error handler ────────────────────────────────────────────────────

app.use(errorMiddleware);

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
