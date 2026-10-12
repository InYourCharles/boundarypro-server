import { Router } from 'express';
import validateObjectId from '../middleware/validateObjectId.js';
import { listMaintenance, createMaintenance, completeMaintenance } from '../controllers/maintenance.controller.js';

const router = Router();

router.get('/', listMaintenance);
router.post('/', createMaintenance);
router.patch('/:id/complete', validateObjectId, completeMaintenance);

export default router;
