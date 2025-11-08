const { v4: uuidv4 } = require("uuid");

function requestIdMiddleware(req, res, next) {
  // Use existing trace ID if propagated from another service
  const existingId = req.headers["x-request-id"];
  const requestId = existingId || uuidv4();

  // Attach ID to request object
  req.id = requestId;

  // Also set it in response headers so clients can see it
  res.setHeader("X-Request-ID", requestId);

  next();
}

module.exports = requestIdMiddleware;
