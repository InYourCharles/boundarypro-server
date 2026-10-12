import mongoose from 'mongoose';
import Driver from '../models/Driver.js';
import Vehicle from '../models/Vehicle.js';
import Assignment from '../models/Assignment.js';
import AppError from '../utils/AppError.js';
import { SHIFT_ORDER } from '../utils/shifts.js';
import { todayManila, parseManilaDate, formatManilaDate } from '../utils/dates.js';
import { getLedger } from './balance.service.js';
import { newestServices, evaluateVehicle } from './maintenanceDue.service.js';

// The booking rules (BR2 and BR7) in one place. POST /api/assignments/check-availability shows the
// result without saving, and POST /api/assignments runs this same code before it saves, so the
// preview and the real booking can never disagree.

const SHIFTS = Object.keys(SHIFT_ORDER);
const isId = (value) => typeof value === 'string' && mongoose.isObjectIdOrHexString(value);

// Checks the shape of { driverId, vehicleId, date, shift } and returns it with the date turned into a Manila day.
// Everything wrong is reported at once, in the { errors: [{ field, message }] } shape the forms already understand.
export function readBooking(body) {
  const errors = [];
  if (!isId(body.driverId)) errors.push({ field: 'driverId', message: 'A valid driver ID is required' });
  if (!isId(body.vehicleId)) errors.push({ field: 'vehicleId', message: 'A valid vehicle ID is required' });

  const date = typeof body.date === 'string' ? parseManilaDate(body.date) : null;
  if (!date) errors.push({ field: 'date', message: 'Date is required and must be a real date written YYYY-MM-DD' });

  if (!SHIFTS.includes(body.shift)) errors.push({ field: 'shift', message: `Shift must be one of: ${SHIFTS.join(', ')}` });

  if (errors.length > 0) throw new AppError('Validation failed', 400, { errors });

  // PAST_DATE is the one reason that is a 400 instead of a normal "available: false" answer
  if (date < todayManila()) {
    const message = `Date cannot be before today (${formatManilaDate(todayManila())})`;
    throw new AppError(message, 400, { code: 'PAST_DATE', errors: [{ field: 'date', message }] });
  }

  return { driverId: body.driverId, vehicleId: body.vehicleId, date, shift: body.shift };
}

// Runs every rule and collects every reason (no early exit), so the dispatcher sees all the problems at once.
// Throws 404 when the driver or vehicle does not exist. Besides the public answer it returns the vehicle,
// because the booking needs its rate (BR1).
export async function checkBooking({ driverId, vehicleId, date, shift }) {
  const [driver, vehicle] = await Promise.all([Driver.findById(driverId).lean(), Vehicle.findById(vehicleId).lean()]);
  if (!driver) throw new AppError('Driver not found', 404);
  if (!vehicle) throw new AppError('Vehicle not found', 404);

  // Who already holds this slot? holdsSlot is the same flag the unique indexes use, so this check and the database agree.
  const [driverBooking, vehicleBooking] = await Promise.all([
    Assignment.findOne({ driver: driver._id, date, shift, holdsSlot: true }).populate('vehicle', 'plateNumber').lean(),
    Assignment.findOne({ vehicle: vehicle._id, date, shift, holdsSlot: true }).populate('driver', 'fullName').lean(),
  ]);

  const day = formatManilaDate(date);
  const reasons = [];
  if (driver.status !== 'active') {
    reasons.push({ code: 'DRIVER_UNAVAILABLE', message: `${driver.fullName} is ${driver.status} and cannot be assigned` });
  }
  if (vehicle.status !== 'available') {
    reasons.push({ code: 'VEHICLE_UNAVAILABLE', message: `${vehicle.plateNumber} is ${vehicle.status.replace('-', ' ')} and cannot be assigned` });
  }
  if (driverBooking) {
    reasons.push({ code: 'DRIVER_BOOKED', message: `${driver.fullName} is already assigned to ${driverBooking.vehicle.plateNumber} on ${day} (${shift})` });
  }
  if (vehicleBooking) {
    reasons.push({ code: 'VEHICLE_BOOKED', message: `${vehicle.plateNumber} is already assigned to ${vehicleBooking.driver.fullName} on ${day} (${shift})` });
  }

  // Warnings do not block the booking, they only tell the dispatcher to think twice
  const warnings = [];
  const { overdueAmount } = await getLedger(driver._id);
  if (overdueAmount >= vehicle.boundaryRate) {
    warnings.push({ code: 'DRIVER_OVERDUE', message: `${driver.fullName} has ${overdueAmount} pesos overdue, at least one day of boundary` });
  }
  const lastService = (await newestServices([vehicle._id])).get(String(vehicle._id));
  const service = evaluateVehicle(vehicle, lastService, todayManila());
  if (service?.severity === 'overdue') {
    warnings.push({ code: 'VEHICLE_SERVICE_DUE', message: `${vehicle.plateNumber} is overdue for service: ${service.reasons.join('; ')}` });
  }

  return { available: reasons.length === 0, reasons, warnings, vehicle };
}
