import Driver from '../models/Driver.js';
import Assignment from '../models/Assignment.js';
import Payment from '../models/Payment.js';
import AppError, { CONFLICT } from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import pick from '../utils/pick.js';
import { readSearch, readChoice, readSort, readInteger, readBoolean, searchPattern } from '../utils/query.js';
import { getLedgers, getBalanceReport } from '../services/balance.service.js';
import { rankDrivers } from '../services/ranking.service.js';

// The only fields a client may write. Everything else in a request body is ignored.
const EDITABLE_FIELDS = ['fullName', 'licenseNumber', 'contactNumber', 'address', 'status', 'dateHired'];

// GET /api/drivers?q=juan&status=active&sort=-dateHired
// Each driver comes back with a computed balance and overdue amount for the list's badges.
export const listDrivers = asyncHandler(async (req, res) => {
  const filter = {};

  const status = readChoice(req.query, 'status', Driver.schema.path('status').enumValues);
  if (status) filter.status = status;

  const q = readSearch(req.query);
  if (q) {
    const pattern = searchPattern(q);
    filter.$or = [{ fullName: pattern }, { licenseNumber: pattern }, { contactNumber: pattern }];
  }

  const sort = readSort(req.query, ['fullName', 'dateHired', 'status'], 'fullName');

  const drivers = await Driver.find(filter).sort(sort).lean();
  const ledgers = await getLedgers(drivers.map((driver) => driver._id));

  res.json(
    drivers.map((driver) => {
      const { balance, overdueAmount } = ledgers.get(String(driver._id));
      return { ...driver, balance, overdueAmount };
    })
  );
});

// GET /api/drivers/:id
export const getDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) throw new AppError('Driver not found', 404);
  res.json(driver);
});

// POST /api/drivers
export const createDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.create(pick(req.body, EDITABLE_FIELDS));
  res.status(201).json(driver);
});

// PUT /api/drivers/:id  (the fields you send are changed; the ones you leave out keep their value)
export const updateDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) throw new AppError('Driver not found', 404);

  driver.set(pick(req.body, EDITABLE_FIELDS));
  await driver.save(); // save() runs the schema rules, so an update is checked exactly like a create
  res.json(driver);
});

// DELETE /api/drivers/:id
export const deleteDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) throw new AppError('Driver not found', 404);

  // BR9: a driver with history stays, so old charges and reports keep their names
  const [hasAssignments, hasPayments] = await Promise.all([
    Assignment.exists({ driver: driver._id }),
    Payment.exists({ driver: driver._id }),
  ]);
  if (hasAssignments || hasPayments) {
    throw new AppError('This driver has assignments or payments and cannot be deleted. Set the status to inactive instead.', CONFLICT);
  }

  await driver.deleteOne();
  res.json({ message: 'Driver deleted' });
});

// GET /api/drivers/ranking?limit=10&minAssignments=3&includeInactive=false
export const getRanking = asyncHandler(async (req, res) => {
  const limit = readInteger(req.query, 'limit', { min: 1, max: 50 }) ?? 10;
  const minAssignments = readInteger(req.query, 'minAssignments', { min: 1 }) ?? 3;
  const includeInactive = readBoolean(req.query, 'includeInactive') ?? false;
  res.json(await rankDrivers({ limit, minAssignments, includeInactive }));
});

// GET /api/drivers/:id/balance
export const getBalance = asyncHandler(async (req, res) => {
  res.json(await getBalanceReport(req.params.id));
});
