/**
 * errorHandler.js
 * Centralized error handling. Every route should either handle its own
 * errors and respond directly, or call next(err) to land here.
 *
 * Rule: the client NEVER sees a stack trace or internal error detail.
 * Full detail goes to the server log only.
 */

function notFoundHandler(req, res) {
  res.status(404).json({ error: "Not found." });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  // Server-side log: timestamp, method/path, and the real error —
  // this is what you'd wire into a log aggregator (see recommendations)
  console.error(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${status}`,
    err.stack || err.message || err
  );

  const clientMessage =
    status < 500 && err.clientMessage
      ? err.clientMessage
      : "Something went wrong on our end. Please try again shortly.";

  res.status(status).json({ error: clientMessage });
}

module.exports = { notFoundHandler, errorHandler };
