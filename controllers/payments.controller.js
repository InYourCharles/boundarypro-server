import Payment from '../models/Payment.js';
import Driver from '../models/Driver.js';
import Assignment from '../models/Assignment.js';
import AppError, { fieldError } from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import pick from '../utils/pick.js';
import { readChoice, readObjectId, readDateRange, readSort } from '../utils/query.js';
import { getLedger } from '../services/balance.service.js';

// Payments are append-only (BR6): there is no update or delete, so this is the only write path.
const EDITABLE_FIELDS = ['driver', 'assignment', 'amountPaid', 'method', 'paidAt', 'referenceNo', 'remarks'];

// GET /api/payments?driver=<id>&method=gcash&from=2026-10-01&to=2026-10-10&sort=-amountPaid
export const listPayments = asyncHandler(async (req, res) => {
  const filter = {};

  const driver = readObjectId(req.query, 'driver');
  if (driver) filter.driver = driver;

  const method = readChoice(req.query, 'method', Payment.schema.path('method').enumValues);
  if (method) filter.method = method;

  const paidAt = readDateRange(req.query);
  if (paidAt) filter.paidAt = paidAt;

  const sort = readSort(req.query, ['paidAt', 'amountPaid'], '-paidAt');

  res.json(await Payment.find(filter).sort(sort).populate('driver', 'fullName'));
});

// POST /api/payments
export const createPayment = asyncHandler(async (req, res) => {
  const payment = new Payment(pick(req.body, EDITABLE_FIELDS));
  await payment.validate(); // the schema rules come first, so a missing or bad field is a 400 before anything is looked up

  const driver = await Driver.findById(payment.driver);
  if (!driver) throw new AppError('Driver not found', 404);

  // The assignment link is only informational, but it must at least be this driver's own assignment
  if (payment.assignment) {
    const assignment = await Assignment.findById(payment.assignment);
    if (!assignment) throw new AppError('Assignment not found', 404);
    if (String(assignment.driver) !== String(driver._id)) {
      throw fieldError('assignment', 'That assignment belongs to a different driver');
    }
  }

  // BR6: a payment can never be larger than what the driver still owes
  const { balance } = await getLedger(driver._id);
  const outstanding = Math.max(0, balance);
  if (payment.amountPaid > outstanding) {
    throw fieldError(
      'amountPaid',
      outstanding === 0
        ? `${driver.fullName} has no outstanding balance`
        : `Payment of ${payment.amountPaid} pesos is more than the outstanding balance of ${outstanding} pesos`
    );
  }

  await payment.save();
  await payment.populate('driver', 'fullName');
  res.status(201).json(payment);
});
