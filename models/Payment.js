import mongoose from 'mongoose';
import { isFutureDate } from '../utils/dates.js';

const PAYMENT_METHODS = ['cash', 'gcash', 'bank-transfer'];

const paymentSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: [true, 'Driver is required'],
    },
    // Informational only: balances are worked out from the driver's total payments (FIFO), not from this link
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
    },
    amountPaid: {
      type: Number,
      required: [true, 'Amount paid is required'],
      min: [1, 'Amount paid must be at least 1 peso'],
      max: [100000, 'Amount paid must be at most 100000 pesos'],
    },
    method: {
      type: String,
      enum: { values: PAYMENT_METHODS, message: `Method must be one of: ${PAYMENT_METHODS.join(', ')}` },
      default: 'cash',
    },
    paidAt: {
      type: Date,
      default: Date.now,
      validate: {
        validator: (value) => !isFutureDate(value),
        message: 'Payment date cannot be in the future',
      },
    },
    referenceNo: {
      type: String,
      trim: true,
      maxlength: [40, 'Reference number must be at most 40 characters'],
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [200, 'Remarks must be at most 200 characters'],
    },
  },
  { timestamps: true }
);

export default mongoose.model('Payment', paymentSchema);
