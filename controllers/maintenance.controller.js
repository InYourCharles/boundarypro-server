import Maintenance from '../models/Maintenance.js';
import Vehicle from '../models/Vehicle.js';
import AppError, { CONFLICT, fieldError } from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import pick from '../utils/pick.js';
import { readChoice, readObjectId, readSort } from '../utils/query.js';

const EDITABLE_FIELDS = ['vehicle', 'type', 'description', 'cost', 'status', 'serviceDate', 'odometerKm', 'nextDueDate', 'nextDueOdometerKm'];
// When a service is completed, these are the figures the shop may correct (the final bill, the reading, the next sticker)
const COMPLETE_FIELDS = ['description', 'cost', 'odometerKm', 'nextDueDate', 'nextDueOdometerKm'];

// BR8: a completed service becomes the vehicle's "last service", unless the vehicle already has a newer one
// (logging an old service afterwards must not move the date backwards). The odometer never goes backwards either.
function recordAsLastService(vehicle, record) {
  if (!vehicle.lastServiceDate || record.serviceDate >= vehicle.lastServiceDate) {
    vehicle.lastServiceDate = record.serviceDate;
    vehicle.lastServiceOdometerKm = record.odometerKm;
  }
  vehicle.odometerKm = Math.max(vehicle.odometerKm, record.odometerKm);
}

// GET /api/maintenance?vehicle=<id>&status=in-progress&type=brakes&sort=-cost
export const listMaintenance = asyncHandler(async (req, res) => {
  const filter = {};

  const vehicle = readObjectId(req.query, 'vehicle');
  if (vehicle) filter.vehicle = vehicle;

  const status = readChoice(req.query, 'status', Maintenance.schema.path('status').enumValues);
  if (status) filter.status = status;

  const type = readChoice(req.query, 'type', Maintenance.schema.path('type').enumValues);
  if (type) filter.type = type;

  const sort = readSort(req.query, ['serviceDate', 'cost'], '-serviceDate');

  res.json(await Maintenance.find(filter).sort(sort).populate('vehicle', 'plateNumber type model'));
});

// POST /api/maintenance
// An in-progress record puts the vehicle in the shop. A completed record (a service that already happened)
// becomes the vehicle's last service.
export const createMaintenance = asyncHandler(async (req, res) => {
  const record = new Maintenance(pick(req.body, EDITABLE_FIELDS));
  await record.validate(); // schema rules first, so a missing or bad field is a 400 before anything is looked up

  const vehicle = await Vehicle.findById(record.vehicle);
  if (!vehicle) throw new AppError('Vehicle not found', 404);

  if (record.status === 'in-progress') {
    if (vehicle.status === 'retired') throw fieldError('vehicle', 'A retired vehicle cannot be serviced');
    if (vehicle.status === 'under-maintenance') {
      throw fieldError('vehicle', 'This vehicle already has a service in progress', CONFLICT);
    }
    vehicle.status = 'under-maintenance';
    vehicle.odometerKm = Math.max(vehicle.odometerKm, record.odometerKm);
  } else {
    recordAsLastService(vehicle, record);
  }

  // Check the vehicle change before saving anything, so a rejected vehicle never leaves a record behind on its own
  await vehicle.validate();
  await record.save();
  await vehicle.save();

  await record.populate('vehicle', 'plateNumber type model');
  res.status(201).json(record);
});

// PATCH /api/maintenance/:id/complete
export const completeMaintenance = asyncHandler(async (req, res) => {
  const record = await Maintenance.findById(req.params.id);
  if (!record) throw new AppError('Maintenance record not found', 404);
  if (record.status === 'completed') throw new AppError('This service is already completed', 400);

  const vehicle = await Vehicle.findById(record.vehicle);

  record.set(pick(req.body, COMPLETE_FIELDS));
  record.status = 'completed';
  recordAsLastService(vehicle, record);
  if (vehicle.status === 'under-maintenance') vehicle.status = 'available'; // BR8 (a vehicle retired meanwhile stays retired)

  await record.validate();
  await vehicle.validate();
  await record.save();
  await vehicle.save();

  await record.populate('vehicle', 'plateNumber type model');
  res.json(record);
});
