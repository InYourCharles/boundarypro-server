import AppError, { CONFLICT } from '../utils/AppError.js';

// Friendly names for the fields that have a unique index
const FIELD_LABELS = {
  licenseNumber: 'License number',
  plateNumber: 'Plate number',
};

// Turns MongoDB's raw duplicate-key error into a short message and the field it belongs to.
function describeDuplicate(err) {
  const fields = Object.keys(err.keyPattern || {});

  // The two booking indexes are (vehicle, date, shift) and (driver, date, shift)
  if (fields.includes('shift')) {
    const who = fields.includes('vehicle') ? 'vehicle' : 'driver';
    return { field: who, message: `This ${who} is already booked for that date and shift` };
  }

  const field = fields[0];
  return { field, message: `${FIELD_LABELS[field] || field} already exists` };
}

// Express knows this is an error handler because it has four parameters.
// `next` is unused, but it must stay in the list or Express will not treat this as an error handler.
export default function errorHandler(err, req, res, next) {
  // 1. An error we threw on purpose: use the status and message we chose.
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message, ...err.details });
  }

  // 2. Mongoose validation failed. Send one entry per bad field so the React form
  //    can show each message under the right input.
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((fieldError) => ({
      field: fieldError.path,
      // A CastError (like "abc" for a number) has a long technical message, so use a short one
      message: fieldError.name === 'CastError' ? `Invalid value for ${fieldError.path}` : fieldError.message,
    }));
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  // 3. Mongoose could not convert a value, for example a bad id inside a query.
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid value for ${err.path}` });
  }

  // 4. A unique index rejected the write (MongoDB error code 11000).
  if (err.code === 11000) {
    const { field, message } = describeDuplicate(err);
    return res.status(CONFLICT).json({ message, errors: [{ field, message }] });
  }

  // 5. express.json() could not read the request body because it is not valid JSON.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body is not valid JSON' });
  }

  // 6. Anything else is a bug on our side. Log the details for us, but never send them to the client.
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
}
