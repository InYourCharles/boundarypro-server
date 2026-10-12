import { Router } from 'express';
import validateObjectId from '../middleware/validateObjectId.js';
import {
  listVehicles,
  getMaintenanceDue,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from '../controllers/vehicles.controller.js';

const router = Router();

router.get('/', listVehicles);
router.get('/maintenance-due', getMaintenanceDue); // a fixed path, declared before /:id
router.post('/', createVehicle);
router.get('/:id', validateObjectId, getVehicle);
router.put('/:id', validateObjectId, updateVehicle);
router.delete('/:id', validateObjectId, deleteVehicle);

export default router;
