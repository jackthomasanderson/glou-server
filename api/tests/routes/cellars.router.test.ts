import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth.middleware', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = 'u1';
    next();
  },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('../../src/services/cellar.service', () => ({
  CellarService: { deleteCellar: vi.fn() },
}));
vi.mock('../../src/services/slot.service', () => ({ slotService: {} }));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));

import cellarsRouter from '../../src/routes/cellars.router';
import { CellarService } from '../../src/services/cellar.service';
import { auditLog } from '../../src/services/audit.service';

const app = express();
app.use(express.json());
app.use('/api/cellars', cellarsRouter);

beforeEach(() => {
  vi.clearAllMocks();
});

// #597: deleting a cellar takes it out of the guest shares, and revokes a
// share left with nothing in scope. The audit entry says which ones.
describe('DELETE /api/cellars/:id — guest shares in the audit (#597)', () => {
  it('records the shares cleaned and the shares revoked', async () => {
    vi.mocked(CellarService.deleteCellar).mockResolvedValue({
      cellar: { id: 'c1' }, sharesCleaned: ['s1', 's2'], sharesRevoked: ['s2'],
    } as never);

    const res = await request(app).delete('/api/cellars/c1');

    expect(res.status).toBe(204);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CELLAR_DELETE',
      status: 'success',
      details: { cellarId: 'c1', sharesCleaned: ['s1', 's2'], sharesRevoked: ['s2'] },
    }));
  });

  it('records only the cellar when no share listed it', async () => {
    vi.mocked(CellarService.deleteCellar).mockResolvedValue({ cellar: { id: 'c1' }, sharesCleaned: [], sharesRevoked: [] } as never);

    await request(app).delete('/api/cellars/c1');

    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ details: { cellarId: 'c1' } }));
  });

  it('answers 404 for an unknown cellar', async () => {
    vi.mocked(CellarService.deleteCellar).mockResolvedValue(null);

    expect((await request(app).delete('/api/cellars/nope')).status).toBe(404);
    expect(auditLog).not.toHaveBeenCalled();
  });
});
