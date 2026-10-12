import mongoose from 'mongoose';
import { isFutureDate } from '../utils/dates.js';

const DRIVER_STATUSES = ['active', 'suspended', 'inactive'];

const driverSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [80, 'Full name must be at most 80 characters'],
    },
    licenseNumber: {
      type: String,
      required: [true, 'License number is required'],
      unique: true, // builds a unique index, so two drivers can never share a license
      uppercase: true,
      trim: true,
      match: [/^[A-Z]\d{2}-\d{2}-\d{6}$/, 'License number must look like N01-21-482913'],
    },
    contactNumber: {
      type: String,
      required: [true, 'Contact number is required'],
      trim: true,
      match: [/^09\d{9}$/, 'Contact number must be 09 followed by 9 digits'],
    },
    address: {
      type: String,
      trim: true,
      maxlength: [150, 'Address must be at most 150 characters'],
    },
    status: {
      type: String,
      enum: { values: DRIVER_STATUSES, message: `Status must be one of: ${DRIVER_STATUSES.join(', ')}` },
      default: 'active',
    },
    dateHired: {
      type: Date,
      default: Date.now,
      validate: {
        validator: (value) => !isFutureDate(value),
        message: 'Date hired cannot be in the future',
      },
    },
  },
  { timestamps: true } // adds createdAt and updatedAt automatically
);

export default mongoose.model('Driver', driverSchema);
