import { Router } from 'express';
import { getCollectionStats } from '../controllers/stats.controller.js';

const router = Router();

router.get('/collections', getCollectionStats);

export default router;
