import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectWithRetry } from './lib/prisma';
import { bottlesRouter } from './routes/bottles.router';
import { authRouter } from './routes/auth.router';
import { errorMiddleware } from './middleware/error.middleware';
import { bottleService } from './services/bottle.service';
import { purgeOldAuditLogs } from './services/audit.service';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ─── Security middleware ─────────────────────────────────────────────────────

app.use(helmet());
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

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/bottles', bottlesRouter);

// ─── 404 handler ────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

// ─── Global error handler ────────────────────────────────────────────────────

app.use(errorMiddleware);

// ─── Startup ─────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  await connectWithRetry();

  // Background maintenance: purge old trash and expired audit logs
  void bottleService.purgeTrashed().then((count) => {
    if (count > 0) console.info(`[startup] Purged ${count} permanently deleted bottles`);
  });
  void purgeOldAuditLogs(90).then((count) => {
    if (count > 0) console.info(`[startup] Purged ${count} old audit log entries`);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.info(`[api] Server listening on port ${PORT} (${process.env.NODE_ENV})`);
  });
}

bootstrap().catch((err) => {
  console.error('[api] Fatal startup error:', err);
  process.exit(1);
});
