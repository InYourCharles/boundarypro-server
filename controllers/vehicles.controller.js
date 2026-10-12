import Vehicle from '../models/Vehicle.js';
import Assignment from '../models/Assignment.js';
import Maintenance from '../models/Maintenance.js';
import AppError, { CONFLICT, fieldError } from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import pick from '../utils/pick.js';
import { readSearch, readChoice, readSort, readInteger, searchPattern, plateSearchPattern } from '../utils/query.js';
import { findMaintenanceDue, DEFAULT_MARGINS } from '../services/maintenanceDue.service.js';

// The only fields a client may write. The last-service fields are not here: they change when a service is completed.
const EDITABLE_FIELDS = ['plateNumber', 'type', 'model', 'boundaryRate', 'odometerKm', 'serviceIntervalKm', 'serviceIntervalDays', 'status'];

// BR8: a vehicle goes into the shop when a service is logged as in progress, and comes out when that service
// is completed. Editing the vehicle must not do either by hand, or the status and the records would disagree.
function checkShopStatus(currentStatus, newStatus) {
  if (newStatus === undefined || newStatus === currentStatus) return;
  if (newStatus === 'under-maintenance') {
    throw fieldError('status', 'A vehicle goes under maintenance when you log a service as in progress');
  }
  if (currentStatus === 'under-maintenance') {
    throw fieldError('status', 'This vehicle is in the shop. Complete its service to make it available again');
  }
}

// GET /api/vehicles?q=nea&type=tricycle&status=available&sort=-boundaryRate
export const listVehicles = asyncHandler(async (req, res) => {
  const filter = {};

  const type = readChoice(req.query, 'type', Vehicle.schema.path('type').enumValues);
  if (type) filter.type = type;

  const status = readChoice(req.query, 'status', Vehicle.schema.path('status').enumValues);
  if (status) filter.status = status;

  const q = readSearch(req.query);
  if (q) filter.$or = [{ plateNumber: plateSearchPattern(q) }, { model: searchPattern(q) }];

  const sort = readSort(req.query, ['plateNumber', 'type', 'status', 'boundaryRate', 'odometerKm'], 'plateNumber');

  res.json(await Vehicle.find(filter).sort(sort));
});

// GET /api/vehicles/:id
export const getVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) throw new AppError('Vehicle not found', 404);
  res.json(vehicle);
});

// POST /api/vehicles
export const createVehicle = asyncHandler(async (req, res) => {
  const fields = pick(req.body, EDITABLE_FIELDS);
  checkShopStatus(undefined, fields.status);

  const vehicle = await Vehicle.create(fields);
  res.status(201).json(vehicle);
});

// PUT /api/vehicles/:id  (the fields you send are changed; the ones you leave out keep their value)
export const updateVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) throw new AppError('Vehicle not found', 404);

  const fields = pick(req.body, EDITABLE_FIELDS);
  checkShopStatus(vehicle.status, fields.status);

  vehicle.set(fields);
  await vehicle.save(); // save() runs the schema rules, so an update is checked exactly like a create
  res.json(vehicle);
});

// DELETE /api/vehicles/:id
export const deleteVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) throw new AppError('Vehicle not found', 404);

  // BR9: a vehicle with history stays, so old assignments and reports keep its plate number
  const [hasAssignments, hasMaintenance] = await Promise.all([
    Assignment.exists({ vehicle: vehicle._id }),
    Maintenance.exists({ vehicle: vehicle._id }),
  ]);
  if (hasAssignments || hasMaintenance) {
    throw new AppError('This vehicle has assignments or maintenance records and cannot be deleted. Set the status to retired instead.', CONFLICT);
  }

  await vehicle.deleteOne();
  res.json({ message: 'Vehicle deleted' });
});

// GET /api/vehicles/maintenance-due?withinDays=14&withinKm=500
export const getMaintenanceDue = asyncHandler(async (req, res) => {
  const withinDays = readInteger(req.query, 'withinDays', { min: 0 }) ?? DEFAULT_MARGINS.withinDays;
  const withinKm = readInteger(req.query, 'withinKm', { min: 0 }) ?? DEFAULT_MARGINS.withinKm;
  res.json(await findMaintenanceDue({ withinDays, withinKm }));
});
