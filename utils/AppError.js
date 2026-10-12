// An error we throw on purpose. It carries the HTTP status the client should receive,
// so the error handler never has to guess. `details` is optional extra JSON for the response body,
// for example { errors: [{ field, message }] } so a form can show the message under the right input.
export default class AppError extends Error {
  constructor(message, statusCode, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Status for "the request is valid but clashes with existing data": a duplicate license or
// plate, a double-booking, or deleting a record that has history. The proposal uses 409.
// If the professor wants only the five codes listed in the rubric, change this one number to 400.
export const CONFLICT = 409;

// An error about one input field, in the same { errors: [{ field, message }] } shape that Mongoose
// validation errors use, so the React form shows it under the right input.
export function fieldError(field, message, statusCode = 400) {
  return new AppError(message, statusCode, { errors: [{ field, message }] });
}
