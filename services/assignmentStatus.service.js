import Assignment from '../models/Assignment.js';
import Vehicle from '../models/Vehicle.js';
import AppError, { fieldError } from '../utils/AppError.js';
import penaltyFor from '../utils/penalty.js';
import { isFutureDate, formatManilaDate } from '../utils/dates.js';

// PATCH /api/assignments/:id/status: moves an assignment through its lifecycle (proposal section 6).
//
//   scheduled -> active | no-show | cancelled
//   active    -> completed
//   completed, no-show and cancelled are final
const ALLOWED_NEXT = {
  scheduled: ['active', 'no-show', 'cancelled'],
  active: ['completed'],
  completed: [],
  'no-show': [],
  cancelled: [],
};

const invalidTransition = (from, to) => new AppError(`Invalid transition: ${from} cannot change to ${to}`, 400);

// A kilometre reading from the request body: a number, zero or more
function readKilometres(value, field, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw fieldError(field, `${label} must be a number, 0 or more`);
  }
  return value;
}

// Works out what changes for this move and the message to show. Throws 400 when a guard fails.
// Nothing is saved here, so a failed guard changes nothing.
function planChange(assignment, status, body) {
  if (status === 'cancelled') {
    return { changes: { status, holdsSlot: false }, message: 'Assignment cancelled. No charge.' };
  }

  // Starting or marking a no-show only makes sense once the shift's day has arrived
  if (status === 'active' || status === 'no-show') {
    if (isFutureDate(assignment.date)) {
      const action = status === 'active' ? 'started' : 'marked as a no-show';
      throw new AppError(`This assignment is on ${formatManilaDate(assignment.date)}, so it cannot be ${action} yet`, 400);
    }
  }

  if (status === 'active') {
    // Left out of the request, the start reading is the vehicle's own odometer
    const start = body.startOdometerKm === undefined ? assignment.vehicle.odometerKm : readKilometres(body.startOdometerKm, 'startOdometerKm', 'Start odometer');
    return { changes: { status, startOdometerKm: start }, message: `Assignment started at ${start} km.` };
  }

  if (status === 'no-show') {
    // The penalty is based on the rate copied at booking time (BR1), then the boundary is waived (BR3)
    const penalty = penaltyFor(assignment.boundaryDue);
    return {
      changes: { status, boundaryDue: 0, penaltyFee: penalty, holdsSlot: false },
      message: `Marked as no-show. Penalty of ${penalty} pesos charged; boundary waived.`,
    };
  }

  // status === 'completed': the end reading is required and cannot be lower than the start reading
  const end = readKilometres(body.endOdometerKm, 'endOdometerKm', 'End odometer');
  if (assignment.startOdometerKm != null && end < assignment.startOdometerKm) {
    throw fieldError('endOdometerKm', `End odometer cannot be lower than the start odometer (${assignment.startOdometerKm} km)`);
  }
  return {
    changes: { status, endOdometerKm: end, holdsSlot: false },
    message: `Assignment completed. Boundary of ${assignment.boundaryDue} pesos is now due.`,
  };
}

export async function changeAssignmentStatus(id, body) {
  const status = body.status;
  const allStatuses = Assignment.schema.path('status').enumValues;
  if (!allStatuses.includes(status)) throw fieldError('status', `Status must be one of: ${allStatuses.join(', ')}`);

  const assignment = await Assignment.findById(id).populate('vehicle', 'odometerKm').lean();
  if (!assignment) throw new AppError('Assignment not found', 404);
  if (!ALLOWED_NEXT[assignment.status].includes(status)) throw invalidTransition(assignment.status, status);

  const { changes, message } = planChange(assignment, status, body);

  // The filter on the current status is what makes this safe: if two requests arrive together, only one finds the
  // assignment still in that status and wins. The other gets null and is told the move is no longer valid, so a
  // double-click can never charge the penalty twice.
  const updated = await Assignment.findOneAndUpdate({ _id: id, status: assignment.status }, { $set: changes }, { new: true });
  if (!updated) {
    const latest = await Assignment.findById(id).select('status').lean();
    throw invalidTransition(latest.status, status);
  }

  // A finished trip moves the vehicle's odometer forward (never backward)
  if (status === 'completed') {
    await Vehicle.updateOne({ _id: assignment.vehicle._id, odometerKm: { $lt: changes.endOdometerKm } }, { $set: { odometerKm: changes.endOdometerKm } });
  }

  await updated.populate([
    { path: 'driver', select: 'fullName' },
    { path: 'vehicle', select: 'plateNumber type' },
  ]);
  return { message, assignment: updated };
}
