import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// #635: reads are not written to the audit log (#160) — the log keeps sign-ins
// and changes only. Opening the consumption plan or the stock count must not
// add a row with the member's IP address.

vi.mock('../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = 'u1';
    next();
  },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));
vi.mock('../../src/services/consumption-plan.service', () => ({
  getSuggestions: vi.fn(),
  postponeItem: vi.fn(),
  getGoalProgress: vi.fn(),
  setGoal: vi.fn(),
}));
vi.mock('../../src/services/inventory-count.service', () => ({
  getActiveSession: vi.fn(),
  startSession: vi.fn(),
  pauseSession: vi.fn(),
  resumeSession: vi.fn(),
  recordScan: vi.fn(),
  recordUnlistedFind: vi.fn(),
  getSessionReport: vi.fn(),
  completeSession: vi.fn(),
}));

import { consumptionPlanRouter } from '../../src/routes/consumption-plan.router';
import { inventoryCountRouter } from '../../src/routes/inventory-count.router';
import { auditLog } from '../../src/services/audit.service';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { getSuggestions, getGoalProgress } from '../../src/services/consumption-plan.service';
import { getActiveSession, getSessionReport } from '../../src/services/inventory-count.service';

const app = express();
app.use(express.json());
app.use('/api/consumption-plan', consumptionPlanRouter);
app.use('/api/inventory-count', inventoryCountRouter);
// #467: the routers let failures reach the error middleware, as in app.ts.
app.use(errorMiddleware);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('read routes write nothing to the audit log (#635)', () => {
  it('GET /api/consumption-plan/suggestions', async () => {
    vi.mocked(getSuggestions).mockResolvedValue([] as never);
    const res = await request(app).get('/api/consumption-plan/suggestions');
    expect(res.status).toBe(200);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('GET /api/consumption-plan/goal', async () => {
    vi.mocked(getGoalProgress).mockResolvedValue(null as never);
    const res = await request(app).get('/api/consumption-plan/goal');
    expect(res.status).toBe(200);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('GET /api/inventory-count/sessions/active', async () => {
    vi.mocked(getActiveSession).mockResolvedValue(null as never);
    const res = await request(app).get('/api/inventory-count/sessions/active');
    expect(res.status).toBe(200);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('GET /api/inventory-count/sessions/:id/report', async () => {
    vi.mocked(getSessionReport).mockResolvedValue({ id: 's1' } as never);
    const res = await request(app).get('/api/inventory-count/sessions/s1/report');
    expect(res.status).toBe(200);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('a failed read is logged to the console, still not audited', async () => {
    vi.mocked(getActiveSession).mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/api/inventory-count/sessions/active');
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });
});
