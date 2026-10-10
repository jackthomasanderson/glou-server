import express from 'express';
import path from 'path';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { inventoryRouter } from './routes/inventory.router';
import { authRouter } from './routes/auth.router';
import cellarsRouter from './routes/cellars.router';
import statsRouter from './routes/stats.router';
import userRouter from './routes/user.router';
import adminRouter from './routes/admin.router';
import bulkPresetsRouter from './routes/bulk-presets.router';
import { alertsRouter } from './routes/alerts.router';
import { consumptionPlanRouter } from './routes/consumption-plan.router';
import { inventoryCountRouter } from './routes/inventory-count.router';
import { maturityReferencesRouter } from './routes/maturity-references.router';
import { errorMiddleware } from './middleware/error.middleware';
import { csrfGuard } from './middleware/csrf.middleware';
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

// ─── Express app assembly ────────────────────────────────────────────────────
// Extracted from index.ts so it can be imported without side effects (no
// DB connection, no cron jobs, no `listen`) — used by the router integration
// tests in tests/integration/ and by index.ts's bootstrap().

export function createApp(): express.Express {
  const app = express();

  // A self-hosted deployment sits behind exactly one reverse proxy (the compose
  // file's, or the operator's own). Trust a single hop so `req.ip` and the
  // rate-limiter below see the real client address from X-Forwarded-For rather
  // than the proxy's — without trusting a longer, spoofable forwarding chain.
  app.set('trust proxy', 1);

  // ─── Access logging (ISSUE_102) ────────────────────────────────────────────
  // Before this, "the tastings page shows an error" had no way to be
  // diagnosed from `docker compose logs api` — no record existed of which
  // request came in, what status it got, or how long it took. `combined` is
  // Apache-style (method, path, status, duration, user-agent); Docker's own
  // log rotation (docker-compose.yml) already caps size, so no extra log
  // infrastructure is needed. Silenced under `vitest` (NODE_ENV=test) so the
  // test suite's own output stays readable.
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  // ─── Security middleware ───────────────────────────────────────────────────

  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));
  app.use(cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  }));
  app.use(cookieParser());
  // A body over the limit, or one that is not valid JSON, is rejected by
  // body-parser with a tagged error; `errorMiddleware` turns those into 413 /
  // 400 rather than the blanket 500 they used to produce (ISSUE_105).
  app.use(express.json({ limit: '2mb' }));

  // CSRF: reject clearly cross-site state-changing requests (see middleware).
  app.use('/api', csrfGuard);

  // ─── Rate limiting ────────────────────────────────────────────────────────
  // Baseline limiter across the whole API surface: every route sits behind
  // cookie auth and touches the database, so an unbounded request rate is a
  // DoS / brute-force vector regardless of the specific endpoint. Generous
  // enough not to interfere with normal interactive use (and the offline sync
  // engine replaying a backlog); `/api/auth/*` keeps its own much tighter
  // limiter below. Keyed on `req.ip`, which is the real client address thanks
  // to the `trust proxy` setting above.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', apiLimiter);

  // ─── Health check ─────────────────────────────────────────────────────────

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ─── Connectivity check (no auth) ─────────────────────────────────────────

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

  // ─── Static Files ─────────────────────────────────────────────────────────

  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // ─── Routes ───────────────────────────────────────────────────────────────

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
  app.use('/api/stats', statsRouter);
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

  // ─── 404 handler ──────────────────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });

  // ─── Global error handler ─────────────────────────────────────────────────
  // Must stay last: it is the only place that turns a thrown value into a
  // response, and the only place that logs server-side failures. Routers are
  // expected to let errors reach it (Express 5 forwards a rejected handler
  // promise on its own) instead of answering 500 themselves.

  app.use(errorMiddleware);

  return app;
}
