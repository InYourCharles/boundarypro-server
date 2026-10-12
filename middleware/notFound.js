import AppError from '../utils/AppError.js';

// Sits after all the routers, so it only runs when no route matched the request.
// It hands a 404 to the error handler so every error leaves the API in the same JSON shape.
export default function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}
