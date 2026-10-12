import mongoose from 'mongoose';
import { startOfDayManila } from '../utils/dates.js';

const SHIFTS = ['morning', 'afternoon', 'night'];
const ASSIGNMENT_STATUSES = ['scheduled', 'active', 'completed', 'no-show', 'cancelled'];

const assignmentSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: [true, 'Driver is required'],
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle is required'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      // Whatever time of day arrives, store midnight in Manila. Then "same day" is a plain
      // equality check, which the unique indexes below depend on. null is left alone so
      // "required" can report it.
      set: (value) => (value == null ? value : startOfDayManila(new Date(value))),
    },
    shift: {
      type: String,
      required: [true, 'Shift is required'],
      enum: { values: SHIFTS, message: `Shift must be one of: ${SHIFTS.join(', ')}` },
    },
    status: {
      type: String,
      enum: { values: ASSIGNMENT_STATUSES, message: `Status must be one of: ${ASSIGNMENT_STATUSES.join(', ')}` },
      default: 'scheduled',
    },
    boundaryDue: {
      type: Number,
      min: [0, 'Boundary due cannot be negative'], // copy of the vehicle's rate at booking time (BR1)
    },
    penaltyFee: {
      type: Number,
      min: [0, 'Penalty fee cannot be negative'],
      default: 0,
    },
    startOdometerKm: {
      type: Number,
      min: [0, 'Start odometer cannot be negative'],
    },
    endOdometerKm: {
      type: Number,
      min: [0, 'End odometer cannot be negative'],
    },
    // true while the assignment is scheduled or active; set to false when it ends or is cancelled
    holdsSlot: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [200, 'Notes must be at most 200 characters'],
    },
  },
  { timestamps: true }
);

// Two partial unique indexes make double-booking impossible, even if two requests arrive at the
// same moment: MongoDB itself refuses the second insert. "Partial" means only documents with
// holdsSlot: true are indexed, so finished or cancelled assignments free their slot for reuse.
assignmentSchema.index(
  { vehicle: 1, date: 1, shift: 1 },
  { unique: true, partialFilterExpression: { holdsSlot: true } }
);
assignmentSchema.index(
  { driver: 1, date: 1, shift: 1 },
  { unique: true, partialFilterExpression: { holdsSlot: true } }
);

// Compares two fields, so it lives in a hook (see the note in Vehicle.js)
assignmentSchema.pre('validate', function () {
  const hasBothReadings = this.startOdometerKm != null && this.endOdometerKm != null;
  if (hasBothReadings && this.endOdometerKm < this.startOdometerKm) {
    this.invalidate('endOdometerKm', 'End odometer cannot be lower than the start odometer');
  }
});

export default mongoose.model('Assignment', assignmentSchema);
