import mongoose from 'mongoose';

const MAINTENANCE_TYPES = ['oil-change', 'tires', 'brakes', 'engine', 'electrical', 'general-service', 'other'];
const MAINTENANCE_STATUSES = ['in-progress', 'completed'];

const maintenanceSchema = new mongoose.Schema(
  {
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle is required'],
    },
    type: {
      type: String,
      required: [true, 'Service type is required'],
      enum: { values: MAINTENANCE_TYPES, message: `Type must be one of: ${MAINTENANCE_TYPES.join(', ')}` },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Description must be at most 200 characters'],
    },
    cost: {
      type: Number,
      required: [true, 'Cost is required'],
      min: [0, 'Cost cannot be negative'],
    },
    status: {
      type: String,
      enum: { values: MAINTENANCE_STATUSES, message: `Status must be one of: ${MAINTENANCE_STATUSES.join(', ')}` },
      default: 'in-progress',
    },
    serviceDate: {
      type: Date,
      default: Date.now,
    },
    odometerKm: {
      type: Number,
      required: [true, 'Odometer reading is required'],
      min: [0, 'Odometer cannot be negative'],
    },
    nextDueDate: {
      type: Date,
    },
    nextDueOdometerKm: {
      type: Number,
    },
  },
  { timestamps: true }
);

// These rules compare two fields, so they live in a hook (see the note in Vehicle.js)
maintenanceSchema.pre('validate', function () {
  if (this.nextDueDate && this.nextDueDate <= this.serviceDate) {
    this.invalidate('nextDueDate', 'Next due date must be after the service date');
  }
  if (this.nextDueOdometerKm != null && this.nextDueOdometerKm <= this.odometerKm) {
    this.invalidate('nextDueOdometerKm', 'Next due odometer must be greater than the odometer at service');
  }
});

// Mongoose would name the collection "maintenances"; the proposal calls it "maintenance"
export default mongoose.model('Maintenance', maintenanceSchema, 'maintenance');
