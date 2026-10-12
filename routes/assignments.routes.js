import { Router } from 'express';
import validateObjectId from '../middleware/validateObjectId.js';
import {
  listAssignments,
  getAssignment,
  checkAvailability,
  createAssignment,
  updateAssignmentStatus,
} from '../controllers/assignments.controller.js';

const router = Router();

router.get('/', listAssignments);
router.post('/', createAssignment);
router.post('/check-availability', checkAvailability); // a fixed path, declared before any /:id route
router.get('/:id', validateObjectId, getAssignment);
router.patch('/:id/status', validateObjectId, updateAssignmentStatus);

export default router;
