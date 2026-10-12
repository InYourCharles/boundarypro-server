import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';

// Used on every route that has an :id. A malformed id is rejected here with a clean 400,
// before it can reach the database and cause a CastError.
export default function validateObjectId(req, res, next) {
  // True only for a 24-character hex string, which is what a MongoDB _id looks like
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return next(new AppError('Invalid ID', 400));
  }
  next();
}
