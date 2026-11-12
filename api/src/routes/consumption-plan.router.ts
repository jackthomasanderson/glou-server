import { Router, Request, Response } from 'express';
import { authMiddleware, getClientIp } from '../middleware/auth.middleware';
import { routeParam } from '../lib/http';
import { auditLog } from '../services/audit.service';
import {
  getSuggestions,
  postponeItem,
  getGoalProgress,
  setGoal,
} from '../services/consumption-plan.service';
import { postponeSchema, setGoalSchema, suggestionsQuerySchema } from '../schemas/consumption-plan.schema';
import { notFound } from '../lib/errors';

const router = Router();

router.use(authMiddleware);

// #467: errors (a ZodError included: 400 VALIDATION_ERROR) go to the error middleware.

// ─── GET /api/consumption-plan/suggestions ───────────────────────────────────
// Shared, non-userId-filtered list — see consumption-plan.service.ts header.
// #635: a read is not audited (#160) — the log keeps sign-ins and changes only.

router.get('/suggestions', async (req: Request, res: Response): Promise<void> => {
  const { limit } = suggestionsQuerySchema.parse(req.query);
  const suggestions = await getSuggestions(limit);
  res.json({ data: suggestions });
});

// ─── PATCH /api/consumption-plan/items/:id/postpone ──────────────────────────

router.patch('/items/:id/postpone', async (req: Request, res: Response): Promise<void> => {
  const id = routeParam(req.params.id);
  const { days } = postponeSchema.parse(req.body ?? {});
  const success = await postponeItem(id, days);
  if (!success) throw notFound('BOTTLE_NOT_FOUND');
  void auditLog({
    userId: req.userId,
    action: 'UPDATE',
    status: 'success',
    ip: getClientIp(req),
    bottleId: id,
    details: { scope: 'consumption-plan-postpone', days },
  });
  res.json({ data: { ok: true } });
});

// ─── GET /api/consumption-plan/goal ───────────────────────────────────────────
// Personal — scoped to req.userId, see consumption-plan.service.ts header.

router.get('/goal', async (req: Request, res: Response): Promise<void> => {
  const progress = await getGoalProgress(req.userId);
  res.json({ data: progress });
});

// ─── PUT /api/consumption-plan/goal ────────────────────────────────────────────

router.put('/goal', async (req: Request, res: Response): Promise<void> => {
  const input = setGoalSchema.parse(req.body);
  const goal = await setGoal(req.userId, input);
  void auditLog({
    userId: req.userId,
    action: 'CREATE',
    status: 'success',
    ip: getClientIp(req),
    details: { scope: 'consumption-goal', goalId: goal.id },
  });
  res.status(201).json({ data: goal });
});

export { router as consumptionPlanRouter };
