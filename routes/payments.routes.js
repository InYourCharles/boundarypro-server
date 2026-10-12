import { Router } from 'express';
import { listPayments, createPayment } from '../controllers/payments.controller.js';

const router = Router();

router.get('/', listPayments);
router.post('/', createPayment);

export default router;
