import { Router } from 'express';
import validateObjectId from '../middleware/validateObjectId.js';
import {
  listDrivers,
  getRanking,
  getDriver,
  getBalance,
  createDriver,
  updateDriver,
  deleteDriver,
} from '../controllers/drivers.controller.js';

const router = Router();

router.get('/', listDrivers);
router.get('/ranking', getRanking); // a fixed path, declared before /:id so Express does not read "ranking" as an id
router.post('/', createDriver);
router.get('/:id', validateObjectId, getDriver);
router.get('/:id/balance', validateObjectId, getBalance);
router.put('/:id', validateObjectId, updateDriver);
router.delete('/:id', validateObjectId, deleteDriver);

export default router;
