import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/products', authMiddleware, async (_req, res) => {
  // Stub — plug in Vivino/Whiskybase/etc. integration here
  res.json([]);
});

export default router;
