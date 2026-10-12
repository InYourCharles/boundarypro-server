// Express 4 does not catch errors thrown inside async functions. This wrapper sends any
// failure to next(), so it reaches errorHandler instead of leaving the request hanging.
export default function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
