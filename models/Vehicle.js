import mongoose from 'mongoose';

const VEHICLE_TYPES = ['tricycle', 'jeepney'];
const VEHICLE_STATUSES = ['available', 'under-maintenance', 'retired'];

// Every plate is stored as "ABC 1234" (3 letters, a space, 3 or 4 digits). Typing "abc1234" or
// "ABC  1234" ends up as the same text, so the unique index cannot be dodged with spacing or case.
function normalizePlate(value) {
  if (typeof value !== 'string') return value;
  const compact = value.toUpperCase().replace(/\s+/g, '');
  return compact.replace(/^([A-Z]{3})(\d{3,4})$/, '$1 $2');
}

const vehicleSchema = new mongoose.Schema(
  {
    plateNumber: {
      type: String,
      required: [true, 'Plate number is required'],
      unique: true,
      set: normalizePlate,
      match: [/^[A-Z]{3} \d{3,4}$/, 'Plate number must be 3 letters then 3 or 4 digits, like NEA 4521'],
    },
    type: {
      type: String,
      required: [true, 'Vehicle type is required'],
      enum: { values: VEHICLE_TYPES, message: `Type must be one of: ${VEHICLE_TYPES.join(', ')}` },
    },
    model: {
      type: String,
      trim: true,
      maxlength: [60, 'Model must be at most 60 characters'],
    },
    boundaryRate: {
      type: Number,
      required: [true, 'Boundary rate is required'],
      min: [100, 'Boundary rate must be at least 100 pesos'],
      max: [2000, 'Boundary rate must be at most 2000 pesos'],
    },
    odometerKm: {
      type: Number,
      min: [0, 'Odometer cannot be negative'],
      default: 0,
    },
    serviceIntervalKm: {
      type: Number,
      min: [500, 'Service interval must be at least 500 km'],
      max: [20000, 'Service interval must be at most 20000 km'],
      default: 5000,
    },
    serviceIntervalDays: {
      type: Number,
      min: [7, 'Service interval must be at least 7 days'],
      max: [365, 'Service interval must be at most 365 days'],
      default: 90,
    },
    lastServiceDate: {
      type: Date,
    },
    lastServiceOdometerKm: {
      type: Number,
      min: [0, 'Last service odometer cannot be negative'],
      default: 0,
    },
    status: {
      type: String,
      enum: { values: VEHICLE_STATUSES, message: `Status must be one of: ${VEHICLE_STATUSES.join(', ')}` },
      default: 'available',
    },
  },
  { timestamps: true }
);

// A rule that compares two fields lives in a hook, not on one field. A field validator only runs
// when its own field changed, so changing only lastServiceOdometerKm could slip past it.
// A negative odometer is skipped here so the field's own "cannot be negative" message is the one shown.
vehicleSchema.pre('validate', function () {
  if (this.odometerKm >= 0 && this.odometerKm < this.lastServiceOdometerKm) {
    this.invalidate('odometerKm', 'Odometer cannot be lower than the odometer at the last service');
  }
});

export default mongoose.model('Vehicle', vehicleSchema);
