import Assignment from '../models/Assignment.js';
import AppError, { CONFLICT } from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { readChoice, readObjectId, readDateRange, readSort } from '../utils/query.js';
import { SHIFT_ORDER } from '../utils/shifts.js';
import { readBooking, checkBooking } from '../services/availability.service.js';
import { changeAssignmentStatus } from '../services/assignmentStatus.service.js';

// GET /api/assignments?from=2026-10-10&to=2026-10-12&shift=morning&status=scheduled&driver=<id>&vehicle=<id>&sort=-date
// `from` and `to` are whole Manila days, both included. Oldest first unless sort=-date.
export const listAssignments = asyncHandler(async (req, res) => {
  const filter = {};

  const dateRange = readDateRange(req.query);
  if (dateRange) filter.date = dateRange;

  const shift = readChoice(req.query, 'shift', Assignment.schema.path('shift').enumValues);
  if (shift) filter.shift = shift;

  const status = readChoice(req.query, 'status', Assignment.schema.path('status').enumValues);
  if (status) filter.status = status;

  const driver = readObjectId(req.query, 'driver');
  if (driver) filter.driver = driver;

  const vehicle = readObjectId(req.query, 'vehicle');
  if (vehicle) filter.vehicle = vehicle;

  const direction = readSort(req.query, ['date'], 'date').date; // 1 = oldest first, -1 = newest first

  const assignments = await Assignment.find(filter)
    .sort({ _id: 1 }) // a fixed starting order, so assignments in the same slot always come back in the same order
    .populate('driver', 'fullName')
    .populate('vehicle', 'plateNumber type')
    .lean();

  // By day, then by the order the shifts happen in. MongoDB would sort the words alphabetically
  // ("afternoon" before "morning"), so the shift part of the sort is done here.
  assignments.sort((a, b) => direction * (a.date - b.date || SHIFT_ORDER[a.shift] - SHIFT_ORDER[b.shift]));

  res.json(assignments);
});

// GET /api/assignments/:id (with the driver and vehicle details the detail screen needs)
export const getAssignment = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id)
    .populate('driver', 'fullName licenseNumber contactNumber status')
    .populate('vehicle', 'plateNumber type model boundaryRate odometerKm status');
  if (!assignment) throw new AppError('Assignment not found', 404);
  res.json(assignment);
});

// POST /api/assignments/check-availability: the booking rules, nothing is saved
export const checkAvailability = asyncHandler(async (req, res) => {
  const { available, reasons, warnings } = await checkBooking(readBooking(req.body));
  res.json({ available, reasons, warnings });
});

// The 409 answer for a booking that is not allowed: the same reasons the preview shows
function bookingConflict({ reasons, warnings }) {
  return new AppError(reasons.map((reason) => reason.message).join('. '), CONFLICT, { reasons, warnings });
}

// POST /api/assignments: runs the same rules as check-availability, then saves
export const createAssignment = asyncHandler(async (req, res) => {
  const booking = readBooking(req.body);
  const check = await checkBooking(booking);
  if (!check.available) throw bookingConflict(check);

  let assignment;
  try {
    assignment = await Assignment.create({
      driver: booking.driverId,
      vehicle: booking.vehicleId,
      date: booking.date,
      shift: booking.shift,
      boundaryDue: check.vehicle.boundaryRate, // BR1: copy the rate now, so a later rate change cannot rewrite this booking
      notes: req.body.notes,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Two dispatchers booked the same slot at the same moment: both passed the check above, and the unique index
    // let only one insert through. Check again so this one gets the same clear reasons as any other conflict.
    const again = await checkBooking(booking);
    throw again.available ? err : bookingConflict(again);
  }

  await assignment.populate([
    { path: 'driver', select: 'fullName' },
    { path: 'vehicle', select: 'plateNumber type' },
  ]);
  res.status(201).json(assignment);
});

// PATCH /api/assignments/:id/status
export const updateAssignmentStatus = asyncHandler(async (req, res) => {
  res.json(await changeAssignmentStatus(req.params.id, req.body));
});
