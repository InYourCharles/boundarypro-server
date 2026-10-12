// Prints one line per request: method, path, status code and how long it took.
export default function requestLogger(req, res, next) {
  const startedAt = Date.now();

  // The status code is only known once the response has been sent,
  // so we log inside the 'finish' event instead of right away.
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });

  next();
}
