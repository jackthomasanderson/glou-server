import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { auditLog } from '../services/audit.service';
import {
  getSuggestions,
  postponeItem,
  getGoalProgress,
  setGoal,
} from '../services/consumption-plan.service';
import { postponeSchema, setGoalSchema, suggestionsQuerySchema } from '../schemas/consumption-plan.schema';

const router = Router();

router.use(authMiddleware);

// ─── GET /api/consumption-plan/suggestions ───────────────────────────────────
// Shared, non-userId-filtered list — see consumption-plan.service.ts header.

router.get('/suggestions', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const { limit } = suggestionsQuerySchema.parse(req.query);
    const suggestions = await getSuggestions(limit);
    void auditLog({
      userId: req.userId,
      action: 'LIST',
      status: 'success',
      ip,
      details: { scope: 'consumption-plan-suggestions', count: suggestions.length },
    });
    res.json({ data: suggestions });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    void auditLog({
      userId: req.userId,
      action: 'LIST',
      status: 'error',
      ip,
      details: { scope: 'consumption-plan-suggestions', message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── PATCH /api/consumption-plan/items/:id/postpone ──────────────────────────

router.patch('/items/:id/postpone', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const ip = getClientIp(req);
  try {
    const { days } = postponeSchema.parse(req.body ?? {});
    const success = await postponeItem(id, days);
    if (!success) {
      res.status(404).json({ error: 'BOTTLE_NOT_FOUND' });
      return;
    }
    void auditLog({
      userId: req.userId,
      action: 'UPDATE',
      status: 'success',
      ip,
      bottleId: id,
      details: { scope: 'consumption-plan-postpone', days },
    });
    res.json({ data: { ok: true } });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    void auditLog({
      userId: req.userId,
      action: 'UPDATE',
      status: 'error',
      ip,
      bottleId: id,
      details: { scope: 'consumption-plan-postpone', message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── GET /api/consumption-plan/goal ───────────────────────────────────────────
// Personal — scoped to req.userId, see consumption-plan.service.ts header.

router.get('/goal', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const progress = await getGoalProgress(req.userId);
    void auditLog({ userId: req.userId, action: 'LIST', status: 'success', ip, details: { scope: 'consumption-goal' } });
    res.json({ data: progress });
  } catch (error) {
    void auditLog({
      userId: req.userId,
      action: 'LIST',
      status: 'error',
      ip,
      details: { scope: 'consumption-goal', message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

// ─── PUT /api/consumption-plan/goal ────────────────────────────────────────────

router.put('/goal', async (req: Request, res: Response): Promise<void> => {
  const ip = getClientIp(req);
  try {
    const input = setGoalSchema.parse(req.body);
    const goal = await setGoal(req.userId, input);
    void auditLog({
      userId: req.userId,
      action: 'CREATE',
      status: 'success',
      ip,
      details: { scope: 'consumption-goal', goalId: goal.id },
    });
    res.status(201).json({ data: goal });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'VALIDATION_ERROR', details: error.errors });
      return;
    }
    void auditLog({
      userId: req.userId,
      action: 'CREATE',
      status: 'error',
      ip,
      details: { scope: 'consumption-goal', message: String(error) },
    });
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
});

export { router as consumptionPlanRouter };
